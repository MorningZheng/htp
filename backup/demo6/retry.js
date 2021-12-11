const dgram=require('dgram');

const handler={
    SYN:[
        //发送
        function (){
            this._sending=true;
            let cnt=-1;
            const fn=()=>{
                cnt++;
                if(cnt<this.$DEF.total){
                    this.$session.tmr=setTimeout(fn,this.$DEF.delay);
                    this._setStep(this.$session.task,this.$session.step=1).writeUInt32BE(this.$session.data.length,4);
                    this._send();
                }else{
                    if(this.$session.callback instanceof Function)this.$session.callback(new Error('timeout'));
                };
            };
            fn();
        },
        //接收到
        function (buf,inf){
            const len=this._getLength(buf),data=buf.slice(8);
            if(len===data.length){
                this.$session={
                    tmr:-1,
                    step:-1,
                    data,
                    task:Buffer.concat([Buffer.from('SYN'),Buffer.alloc(5,'0')]),
                    host:inf,
                };
                if(this.$receive instanceof Function)this.$receive(data,inf);
                this._setStep(this.$session.task,this.$session.step=2).writeUInt32BE(len*2,4);
                this._send();
            };
        },
        function (buf,inf){
            const sum=this._getLength(buf);
            clearTimeout(this.$session.tmr);//清除本地重试
            if(sum===this.$session.answer && !this.$session.complete){
                this.$session.complete=true;
                if(this.$session.callback instanceof Function)this.$session.callback(null,true);
                this._sending=false;
            };
        },
    ],
};

module.exports=class retry{
    $socket;
    $session;

    $DEF={
        total:5,
        delay:500,
    };

    $receive;
    $messager;

    constructor(options) {
        this.$socket=this._getSocketBy(options);

        this.$socket.on('message',(buf,inf)=>{
            const head=buf.slice(0,3).toString(),step=buf.readUInt8(3);
            if(handler[head] && handler[head][step])handler[head][step].call(this,buf,inf);
            else if(this.$messager instanceof Function)this.$messager(buf,inf);
        });
    }

    send(data,host,callback){
        this.$session={
            complete:false,
            tmr:-1,
            step:-1,
            answer:data.length*2,
            data,
            task:Buffer.concat([Buffer.from('SYN'),Buffer.alloc(5,'0'),Buffer.isBuffer(data)?data:Buffer.from(data)]),
            host,
            callback,
        };
        handler.SYN[0].call(this);
    };

    _sending=false;
    _send(data,host,callback){
        if(this._closed)return false;
        if(arguments.length)this.$socket.send(data,host.port,host.address,callback);
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
        if(this._closed)return;
        this.$socket.close(()=>{
            this._closed=true;
            if(callback instanceof Function)callback();
        });
    }

};

