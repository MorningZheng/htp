const dgram=require('dgram');
const {EventEmitter}=require('events');
const retry=require('./retry');


handler={
    SND:[
        //start? 0 a
        function (buf,inf){
            const task=this.$task[0];
            task.tmr=setTimeout(()=>{
                console.log('timeout');
            },this.$PACK.delay);
            const data=Buffer.concat([Buffer.from('SND'),Buffer.alloc(9,0)]);
            data.writeUInt8(1,3);
            data.writeUInt32BE(this.$index,4);
            data.writeUInt32BE(task.total,8);//index避免重复，序列号
            this.$rudp.send(data,task.host);
        },
        //get 1 b
        function (buf,inf){
            const index=buf.readUInt32BE(4),total=buf.readUInt32BE(8);
            if(!this.$work){
                this.$work={
                    host:inf,
                    index,
                    total,
                    list:[],
                    lost:[],
                    reporting:false,
                };
            };

            const data=Buffer.concat([Buffer.from('SND'),Buffer.alloc(5,0)]);
            data.writeUInt8(2,3);
            this.$rudp.send(data,inf);
        },
        // 2 a
        function (buf,inf){
            const task=this.$task[0];
            clearTimeout(task.tmr);//清理超时

            //开始使用udp发送数据
            this._sendTask().then();
        },
    //    执行发送检查 3 b
        function (buf,inf){
            this._checkList(true);
            this._reportList();
        },
        //发送收到结果 4
        function (buf,inf){
            const task=this.$task[0];
            // if(!task)return;

            clearTimeout(task.chk);//清理超时

            const lost=[];
            for(let i=8;i<buf.length;i+=4)lost.push(buf.readUInt32BE(i));

            if(lost.length)this._sendTask(lost).then();
            else{
                this.$task.shift();
                this._send();
            };
        },
    ],
    SEQ(buf,inf){
        const idx=buf.readUInt8(3),seq=buf.readUInt8(4),len=buf.readUInt32BE(8);
        if(this.$work.index===idx){
            const data=buf.slice(12);
            if(data.length===len){
                this.$work.list[seq]=data;
            };
            if(this._checkList()){
                this._reportList();
            }
        };
    },
    CNT:[
        function (buf,inf){
            const data=Buffer.concat([Buffer.from('CNT'),Buffer.alloc(4,0)]);
            data.writeUInt8(1,3);
            this.$tmr=setTimeout(()=>{
                this.emit('close',new Error('lost connect'));
            },this.$CHECK.ping);
            this.$rudp.send(data,inf);
        },
        function (buf,inf){
            if(!this.$couple){
                const data=Buffer.concat([Buffer.from('CNT'),Buffer.alloc(4,0)]);
                data.writeUInt8(2,3);
                this.$rudp.send(data,this.$couple=inf);
            };
        },
        function (buf,inf){
            clearTimeout(this.$tmr);
            if(!this.$couple){
                this.$couple=inf;
                this.emit('connected')
            };
        },
    ],
    CLS:[
        //a
        function (buf,inf){
            const data=Buffer.concat([Buffer.from('CLS'),Buffer.alloc(4,0)]);
            data.writeUInt8(1,3);
            this.$tmr=setTimeout(()=>{
                this.$rudp.close(()=>this.emit('closed',new Error('lost connect'),1));
                // this.emit('close',new Error('lost connect'));
            },this.$CHECK.ping);
            this.$rudp.send(data,inf);
        },
        //b
        function (buf,inf){
            if(this.$couple){
                this.$rudp._closing=true;
                const data=Buffer.concat([Buffer.from('CLS'),Buffer.alloc(4,0)]);
                data.writeUInt8(2,3);
                this.$rudp.send(data,this.$couple);
                this.$couple=undefined;
            };
        },
        //a
        function (buf,inf){
            clearTimeout(this.$tmr);
            if(this.$couple){
                const data=Buffer.concat([Buffer.from('CLS'),Buffer.alloc(4,0)]);
                data.writeUInt8(3,3);
                this.$rudp.send(data,this.$couple,(err,res)=>{
                    this.$couple=undefined;
                    this.$rudp.close(()=>this.emit('closed',null,0));
                });
            };
        },
        //b
        function (buf,inf){
            process.nextTick(()=>this.$rudp.close(()=>this.emit('closed',null,0)));
        }
    ],
};

class KCP extends EventEmitter{
    $rudp;
    $task;
    $work;
    $index=0;
    _sending=false;
    $tmr=-1;

    $couple=null;

    $PACK={
        len:2,
        delay:3000,
    };

    $CHECK={
        delay:1000,
        max:5,
        ping:10000,
    };

    constructor(options) {
        super();
        this.$rudp=new retry(options);
        this.$rudp.$receive=(buf,inf)=>{
            const head=buf.slice(0,3).toString(),step=buf.readUInt8(3);
            if(!handler[head])return;
            if(handler[head] instanceof Function)handler[head].call(this,buf,inf);
            else if(handler[head][step] instanceof Function)handler[head][step].call(this,buf,inf);
        };
        this.$rudp.$messager=(buf,inf)=>{
            const head=buf.slice(0,3).toString();
            if(handler[head] instanceof Function)handler[head].call(this,buf,inf);
        };
        this.$task=[];
    }

    listen(port,host){
        this.$rudp.$socket.bind(port,host);
        this.$task=[];
    };

    connect(port,host){
        if(this.$couple){
            throw new Error('socket already connected.');
        };
        handler.CNT[0].call(this,null,{port,address:host,host});
    };

    close(){
        if(!this.$couple){
            throw new Error('connected first.');
        };
        handler.CLS[0].call(this,null,this.$couple);
    };

    //1对1
    write(data,callback){
        if(!this.$couple){
            throw new Error('connect couple first.');
        };

        this.$task.push({
            retry:-1,
            lost:[],
            data:Buffer.isBuffer(data)?data:Buffer.from(data),host:this.$couple,callback,
            tmr:-1,
            total:Math.ceil(data.length/this.$PACK.len),
        });
        if(!this._sending){
            this._sending=true;
            this._send();
        };
    }

    _send(){
        if(this.$task.length){
            this.$index++;
            if(this.$index>254)this.$index=1;
            handler.SND[0].call(this);
        }else console.log('send complete');
    };

    async _sendTask(lost){
        const task=this.$task[0];
        task.retry++;
        if(task.retry>this.$CHECK.max){
            return new Error('retryMax');
        };

        const model=Buffer.concat([Buffer.from('SEQ'),Buffer.alloc(9,0)]);
        model.writeUInt8(this.$index,3);//index避免重复，序列号，字段长度


        if(lost){
            for(let l=0;l<lost.length;l++){
                const i=lost[l];
                await this._doSendTask(model,i,task.data.slice(i*this.$PACK.len,(i+1)*this.$PACK.len));
            };
        }else{
            for(let i=0;i<task.total;i++){
                await this._doSendTask(model,i,task.data.slice(i*this.$PACK.len,(i+1)*this.$PACK.len));
            };
        };

        task.chk=setTimeout(()=>{
            const data=Buffer.concat([Buffer.from('SND'),Buffer.alloc(5,0)]);
            data.writeUInt8(3,3);
            this.$rudp.send(data,task.host);
        },this.$CHECK.delay);
    };

    _doSendTask(model,index,data){
        model.writeUInt32BE(index,4);
        model.writeUInt32BE(data.length,8);
        return new Promise((rel,rej)=>{
            this.$rudp._send(Buffer.concat([model,data]),this.$task[0].host,err=>{
                err?rej(err):rel();
            });
        });
    };

    _checkList(recode=false){
        if(this.$work.reporting)return;

        this.$work.lost.length=0;
        if(recode){
            for(let i=0;i<this.$work.total;i++){
                if(!this.$work.list[i]){
                    const b=Buffer.alloc(4);
                    b.writeUInt32BE(i);
                    this.$work.lost.push(b);
                };
            };
            return this.$work.lost.length===0;
        }else{
            for(let i=0;i<this.$work.total;i++){
                if(!this.$work.list[i])return false;
            };
            return true;
        };
    };

    _reportList(lost){
        if(!this.$work.reporting){
            this.$work.reporting=true;
            lost=lost||[];
            lost.unshift(Buffer.from('SND'),Buffer.alloc(5,0));
            const data=Buffer.concat(lost);
            data.writeUInt8(4,3);
            this.$rudp.send(data,this.$work.host,()=>this.$work.reporting=false);

            //报告
            if(lost.length===2){//含头部
                // console.log('emit','data',this.$work.list);
                this.emit('data',Buffer.concat(this.$work.list));
                this.$work.list.length=0;
                this.$work.lost.length=0;
            };
        };
    };
};

const a=new KCP();
a.listen(8888);
a.on('data',buf=>{
    console.log(buf.toString());
});
// a.$socket.on('message',buf=>{
//     console.log(buf.toString())
// });

const b=new KCP();
b.name='b';
b.connect(8888,'localhost');
b.on('connected',()=>{
    console.log('connected')
    b.write('hello',(err,res)=>console.log(err,res));
    // b.close();
}).on('closed',(err)=>{
    console.log('closed',err);
});

