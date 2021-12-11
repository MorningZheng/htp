const dgram=require('dgram');
const {EventEmitter}=require('events');
const dns=require('dns');

const handler={
    SYN:[
        //发送
        function (task){
            let cnt=-1;
            const item=task.item[0];
            item.body.writeUInt8(1,3);
            task.index++;
            if(task.index>65535)task.index=0;
            item.body.writeUInt16LE(task.index,4);
            item.body.writeUInt16LE(item.data.length,6);

            const fn=()=>{
                if(this._closed)return;

                cnt++;
                if(cnt<this.$DEF.total){
                    task.tmr=setTimeout(fn,this.$DEF.delay);
                    this._send(item.body,item.host);
                }else{
                    if(item.callback instanceof Function)item.callback(new Error('timeout'));
                };
            };
            fn();
        },
        //接收到
        function (buf,inf){
            const seq=buf.readUInt16LE(4),len=buf.readUInt16LE(6),data=buf.slice(8);
            if(len===data.length){
                const uri=`${inf.address}:${inf.port}`;
                if(!this.$work.has(uri))this.$work.set(uri,{uri,tmr:-1,seq:-1});
                const task=this.$work.get(uri);

                clearTimeout(task.tmr);
                task.tmr=setTimeout(()=>this.$work.delete(uri),30*1000);
                if(task.seq!==seq){
                    task.seq=seq;
                    if(this.listenerCount('data'))this.emit('data',data,inf);
                };

                const body=Buffer.concat([Buffer.from('SYN'),Buffer.alloc(1+2+2,0)]);
                body.writeUInt8(2,3);
                body.writeUInt16LE(seq,4);
                body.writeUInt16LE(len*2,6);
                this._send(body,inf,()=>{
                    if(this.listenerCount('#b'))this.emit('#b');
                });
            };
        },
        function (buf,inf){
            const uri=`${inf.address}:${inf.port}`;
            if(this.$task.has(uri)){
                const seq=buf.readUInt16LE(4),len=buf.readUInt16LE(6),task=this.$task.get(uri);
                if(seq===task.index && len===task.item[0].data.length*2){
                    clearTimeout(task.tmr);
                    if(task.item[0].callback instanceof Function)task.item[0].callback(null);
                    task.item.shift();
                    process.nextTick(()=>this._sending(task));
                    if(this.listenerCount('#a'))this.emit('#a');
                };
            };
        },
    ],
};

module.exports=class retry extends EventEmitter{
    $socket;
    $session;

    $work;
    $task;

    $DEF={
        total:5,
        delay:500,
    };

    constructor(options) {
        super();
        this.$socket=this._getSocketBy(options);

        this.$task=new Map;
        this.$work=new Map;
        this.$socket.on('message',this.$message=(buf,inf)=>{
            const head=buf.slice(0,3).toString(),step=buf.readUInt8(3);
            if(handler[head] && handler[head][step])handler[head][step].call(this,buf,inf);
            else if(this.listenerCount('message'))this.emit('message',buf,inf);
        });
    };


    send(data,host,callback){
        data=Buffer.isBuffer(data)?data:Buffer.from(data);
        const body=Buffer.concat([Buffer.from('SYN'),Buffer.alloc(1+2+2,0),data]); //readUInt8+writeUInt16LE+writeUInt16LE，nextStep,index,length
        if(!host.address&&host.host)host.address=host.host;

        dns.lookup(host.address||host.host,(err,ip)=>{
            host.address=ip;
            const uri=`${host.address}:${host.port}`;

            if(!this.$task.has(uri))this.$task.set(uri,{sending:false,host,uri,item:[],index:-1});
            const task=this.$task.get(uri);
            task.item.push({data,host,callback,body,uri});
            if(task.sending===false){
                task.sending=true;
                this._sending(task);
            };
        });
    };

    _sending(task){
        if(this._closed){
            task.item.length=0;
        }else if(task.item.length){
            handler.SYN[0].call(this,task);
        }else task.sending=false;
    };

    _send(data,host,callback){
        if(this._closed || this._closing)return false;
        if(arguments.length)this.$socket.send(data,0,data.length,host.port,host.address,callback);
        else this._send(this.$session.task,this.$session.host,callback);
        return true;
    };

    /**
     * @private
     * @param {Object} [options={}]
     * @property {Socket} [options.socket]
     * @property {string} [options.type="udp4"]
     * @property {bool} [options.reuseAddr]
     * @return {Socket} - udp socket
     */
    _getSocketBy(options = {}) {
        if (options.socket) {
            return options.socket;
        }
        return dgram.createSocket(Object.assign({
            type: "udp4",
        }, options));
    };

    _setStep(data,index){
        data.writeUInt8(index,3);
        return data;
    };

    _getStep(data){
        return data.readUInt8(3);
    };

    _getLength(data){
        return data.readUInt32BE(4);
    };

    _closed=false;_closing=false;
    close(callback){
        if(this._closing)return;
        this._closing=true;
        this.$socket.close(()=>{
            this._closed=true;
            if(callback instanceof Function)callback();
            this.emit('close');
        });
    }

    release(){
        if(this.$message)this.$socket.off('message',this.$message);
        this.$socket=undefined;
    };
};

// const buf=Buffer.alloc(1,0);
// buf.writeUInt8(255);
// console.log(buf.readUInt8());

// const buf=Buffer.alloc(2,0);
// buf.writeUInt16LE(2559829383);//65535
// console.log(buf.readUInt16LE());

// const buf=Buffer.alloc(4,0);
// buf.writeUInt32LE(4294967295.);//4294967295
// console.log(buf.readUInt32LE());