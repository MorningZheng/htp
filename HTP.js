const retry=require('./retry');
const {EventEmitter}=require('events');

const handler={
    CNT:[
        function (buf,inf){
            this.emit('connect',this.$couple=inf);
        },
    ],
    SND:[
        //b start
        function (buf,inf){
            const total=buf.readUInt16LE(4);
            this.$work={total,list:[],lost:[]};
        },
        //b force check
        function (buf,inf){
            this._checkList(true);
            this._reportList();
        },
        function (buf,inf){
            const lost=[];
            for(let i=4;i<buf.length;i+=2)lost.push(buf.readUInt16LE(i));
            if(lost.length)this._sendU(lost).then();
            else this.emit('received');
        },
        //b
        function (buf,inf){
            // console.log('b complete');
            this.emit('data',Buffer.concat(this.$work.list),inf);
            this.$work.list.length=0;
        },
    ],
    END:[
        function (buf,inf){
            this.emit('end',inf);
        },
    ],
    CLS:[
        function (buf,inf){
            this._closed=true;
            process.nextTick(()=>{
                this.$socket.close(()=>this.emit('close'));
            });
        },
    ],
    SEQ (buf,inf){
        const seq=buf.readUInt16LE(4);
        if(!this.$work.list[seq]){
            const len=buf.readUInt16LE(6),data=buf.slice(8);
            if(len===data.length){
                this.$work.list[seq]=data;
                if(this._checkList())process.nextTick(()=>this._reportList());
            };
        };
    },
};

const _getType=(head)=>{
    return head.slice(0,3).toString();
};

const _setStep=(head,step)=>{
    head.writeUInt8(step,3);
};

const _getStep=(head)=>{
    return head.readUInt8(3);
};

const _newBody=(type,step,...buf)=>{
    const body=Buffer.concat([Buffer.from(type),Buffer.alloc(1,0),...buf]);
    _setStep(body,step);
    return body;
};




class HTP extends EventEmitter{
    $socket;$couple;
    $task;
    $work;

    $PACK={
        len:1024,
        delay:3000,
    };

    $CHECK={
        delay:1000,
        max:5,
        ping:10000,
    };

    constructor(socket) {
        super();

        socket=socket||new retry();
        this.$socket=socket;
        this.$task=[];

        socket.on('data',(buf,inf)=>{
            const type=_getType(buf);
            if(!handler[type])return;
            const step=_getStep(buf);
            if(handler[type][step] instanceof Function)handler[type][step].call(this,buf,inf);
        }).on('message',(buf,inf)=>{
            const type=_getType(buf);
            if(handler[type] instanceof Function)handler[type].call(this,buf,inf);
        });
    };

    reg(key,address,port){
        this.$socket.once('data', buf=>{
            if(buf.slice(0,3).toString()==='INF')this.connect(JSON.parse(buf.slice(3).toString()));
        }).send(Buffer.from('REG'+key), {port, address});
    };

    connect(remote,callback){
        if(this.$couple)return;
        this.$socket.send(Buffer.concat([Buffer.from('CNT'),Buffer.alloc(1,0)]),remote,()=>{
            if(callback instanceof Function)callback();
            this.emit('connected',this.$couple=remote);
        });
    };

    _closed=false;
    close(){
        if(this._closed)return;
        this.$task.unshift({
            body:_newBody('CLS',0),
            callback:()=>{
                this.$task.length=0;
                this._closed=true;
                this.$socket.close(()=>this.emit('close'));
            },
        });
        if(!this._writing){
            this._writing=true;
            this._sendT();
        };
    };


    _writing=false;
    write(data,callback){
        if(this._closed)return;
        this.$task.push({
            retry:-1,
            lost:[],
            data:Buffer.isBuffer(data)?data:Buffer.from(data),host:this.$couple,
            callback,
            tmr:-1,
            total:Math.ceil(data.length/this.$PACK.len),
        });
        if(!this._writing){
            this._writing=true;
            this._sendT();
        };
    };

    _sendT(){
        if(this.$task.length===0)return this._writing=false;
        const task=this.$task[0];
        if(task.body){
            this.$socket.send(task.body,this.$couple||task.couple,e=>{
                this.$task.shift();
                if(task.callback instanceof Function)task.callback();
                this._sendT();
            });
        }else this._sendU().then();
    };

    async _sendU(lost){
        const task=this.$task[0];
        if(lost){
            for(let n=0;n<lost.length;n++){
                const i=lost[n];
                await this._sendingU(task.data.slice(i*this.$PACK.len,(i+1)*this.$PACK.len),i);
            };
        }else{
            await new Promise((rel,rej)=>{
                const cmd=_newBody('SND',0,Buffer.alloc(2,0));
                cmd.writeUInt16LE(task.total,4);
                this.$socket.send(cmd,this.$couple,e=>e?rej(e):rel());
            });

            for(let i=0;i<task.total;i++){
                await this._sendingU(task.data.slice(i*this.$PACK.len,(i+1)*this.$PACK.len),i);
            };

            const err=await new Promise((rel)=>{
                let tmr=-1,cnt=-1;

                const fn=()=>{
                    clearTimeout(tmr);
                    cnt++;
                    if(cnt<this.$CHECK.max){
                        tmr=setTimeout(()=>{
                            // console.log('time to check');
                            this.$socket.send(_newBody('SND',1),this.$couple);
                            fn();
                        },this.$CHECK.delay);
                    }else{
                        rel(new Error('timeout'));
                    };
                };
                fn();

                this.once('received',()=>{
                    clearTimeout(tmr);
                    rel();
                });
            });

            if(!err){
                this.$socket.send(_newBody('SND',3),this.$couple,()=>{
                    // console.log('a complete');
                    if(this.listenerCount('drain'))this.emit('drain');
                    if(task.callback instanceof Function)task.callback();
                    this.$task.shift();
                    process.nextTick(()=>this._sendT());
                });
            }else if(this.listenerCount('error'))this.emit('error',err);
            else throw err;
        };
    };

    _sendingU(data,seq){
        const pack=_newBody('SEQ',0,Buffer.alloc(2,0),Buffer.alloc(2,0),data);
        pack.writeUInt16LE(seq,4);
        pack.writeUInt16LE(data.length,6);

        return new Promise((rel,rej)=>{
            this.$socket._send(pack,this.$couple,rel);
        });
    };

    _checkList(recode=false){
        if(this.$work.reporting)return;

        this.$work.lost.length=0;
        if(recode){
            for(let i=0;i<this.$work.total;i++){
                if(!this.$work.list[i]){
                    const b=Buffer.alloc(2);
                    b.writeUInt16LE(i);
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

    _reporting=false;
    _reportList(){
        if(!this._reporting){
            this._reporting=true;
            this.$socket.send(_newBody('SND',2,...this.$work.lost),this.$couple,()=>{
                this._reporting=false;
            });
        };
    };

    end(callback){
        if(this._closed)return;
        this.$task.push({
            callback,
            body:_newBody('END',0),
        });
        if(!this._writing){
            this._writing=true;
            this._sendT();
        };
    };
};

module.exports=HTP;