const {EventEmitter}=require('events');
const {Duplex}=require('stream');
const {Socket:UDP}=require('dgram');

const DEF={
    route(instance,buf,rmi){
        const cmd = buf.slice(0, 3).toString();
        if (!DEF[cmd]) return instance.emit('message',buf,rmi);//console.log(buf.toString());
        else if(DEF[cmd].constructor===Function)return DEF[cmd].call(instance,buf,rmi);

        const num = buf.slice(4, 5).toString();
        const fn=DEF[cmd][num];
        if(fn)return fn.call(instance,buf,rmi);
    },
    LNK:{
        1(buf,rmi){
            //server向客户端返回自身在网络上的端口地址
            const symbol=buf.slice(5).toString();
            if(!this.$pool[symbol])this.$pool[symbol]=[];

            const uri=`${rmi.address}:${rmi.port}`;
            rmi.uri=uri;
            if(!this.$pool[symbol][uri])this.$pool[symbol].unshift(this.$pool[symbol][uri]={});
            Object.assign(this.$pool[symbol][uri],rmi);

            this.$sendo(`LNK=2${uri}`,rmi);

            process.nextTick(async ()=>{
                if(this.$pool[symbol].length>1){
                    const [a,b]=this.$pool[symbol];

                    for(let i=0;i<3;i++)await new Promise(next=>{
                        this.$sendo(`LNK=3${b.uri}`,a,()=>this.$sendo(`LNK=3${a.uri}`,b,()=>setTimeout(next,100)));
                    });

                    this.$pool[symbol].length=0;
                    this.$pool[symbol]=undefined;
                };
            });
        },
        2(buf,rmi){
            //服务器返回的到了单个socket，表示在等
            this.emit('waiting',this._remote=buf.slice(5).toString());
        },
        async 3(buf,rmi){
            //互相握手
            const [ip,port]=buf.slice(5).toString().split(':');
            for(let i=0;i<3;i++){
                await new Promise(next=>this.$send(`LNK=4${this._remote}`,port,ip,next));
            };
        },
        4(buf,rmi){
            // console.log(this._binding,buf.toString());
            this.$sendo('LNK=5',rmi,()=>this.$sendo('LNK=5',rmi));
        },
        5(buf,rmi){
            if(this._binding)return;
            if(!this._binding)this.emit('#connected',this._binding=rmi,this._remote);
            // console.log(this._binding);
        },
    },
    CLS:{
        1(buf,rmi){
            console.log(buf.toString());
            this.$sendo('CLS=2',rmi);
        },
        2(buf,rmi){
            console.log(buf.toString());
            this.$sendo('CLS=3',rmi,()=>this.emit('closing'));
        },
        3(buf,rmi){
            console.log(buf.toString());
            process.nextTick(()=>this.emit('closing'));
        },
        0(buf,rmi){
            this.$close();
        },
    },
    SND:{
        1(buf,rmi){
            this._pullList={total:0};
            this.$sendo('SND=2',rmi);
        },
        2(buf,rmi){
            this.emit('#reciever ready');
        },
        3(buf,rmi){
            const len=parseInt(buf.slice(5,6).toString());
            if(!isNaN(len)){
                const lost=[],data=[];
                for(let i=0;i<len;i++){
                    const idx=SEQ.key[i];
                    if(!this._pullList[idx])lost.push(idx);
                    else data.push(this._pullList[idx]);
                };

                this.$sendo(`SND=4${lost.join('')}`,rmi);

                if(lost.length===0){
                    this.emit('data',Buffer.concat(data));
                };
                data.length=0;
            }else{
                throw new Error('unknow sending len.');
            };
        },
        4(buf,rmi){
            this.emit('#received',buf.slice(5).toString().split(''));
        },
        5(buf,rmi){
            if(this._pullList){
                this._pullList=undefined;
                this.emit('end');
            };
        },
    },
    SEQ(buf,rmi){
        const idx=buf.slice(4,5).toString();
        if(!this._pullList[idx]){
            this._pullList[idx]=buf.slice(5);
            this._pullList.total++;
        };
    },
};

const SEQ={
    key:[],
    map:{},
    head:Buffer.from('SEQ='),
};
for(let i=0;i<10;i++)SEQ.key.push(i.toString());
for(let i=97;i<97+6;i++)SEQ.key.push(String.fromCodePoint(i));
for(const i in SEQ.key)SEQ.map[SEQ.key[i]]=i;


class Socket extends EventEmitter{
    _socket;
    _remote;
    _binding;
    _tmr;

    constructor() {
        super();
        this._tmr={};
        this._socket=new UDP({type:'udp4'});
        this._socket.on('message',(buf,rmi)=> DEF.route(this,buf,rmi));
        this.once('closing',()=>console.log('close ing'));
    };

    //通过服务器链接
    link(symbol,serverPort,serverIP='localhost'){
        (function fn(soc){
            try{
                soc._socket.send(`LNK=1${symbol}`,serverPort,serverIP,err=>{
                    soc._tmr.link=setTimeout(fn,200,soc);
                });
            }catch (e){

            };
        })(this);

    }

    $sendo(data,remote,callback){
        const {port,address='localhost'}=remote;
        this.$send(data,port,address,callback);
    };

    $send(data,port,address,callback){
        this._socket.send(data,port,address,callback);
    };

    _closing=false;

    destroy(error) {
        if(this._binding){
            this.$sendo('CLS=1',this._binding,()=>this.$sendo('CLS=1',this._binding));
        }else this.emit('closing');
    };

    $close(){
        try{
            this._socket.close();
        }catch (e){};
        this._binding=undefined;
        this.emit('close');
    };

    _bufferList;
    #writing=false;

    write(chunk, encoding, cb) {
        if(chunk===null || chunk===undefined)return false;
        if(chunk.constructor===String)chunk=Buffer.from(chunk);
        else{
            const e=new Error('Data must be String or Buffer.');
            if(cb)cb(e);
            else{
                throw e;
            };
        };

        if(!this._bufferList)this._bufferList=[];
        this._bufferList.push(chunk);

        if(!this._binding){
            this.once('#connected',()=>{
                this.#writing=true;
                this.#doWrite().then();
            });
        }else if(!this.#writing){
            this.#writing=true;
            this.#doWrite().then();
        };

        return true;
    };

    static #bufferSize=2;
    _pushList;
    _pullList;

    async #doWrite(){
        if(this._bufferList.length){
            const buffer=this._bufferList[0];
            this._pushList={total:0};

            for(let i=0;i<Math.ceil(buffer.length/Socket.#bufferSize);i++) {
                const idx = SEQ.key[i];
                this._pushList[idx] = Buffer.concat([SEQ.head, Buffer.from(idx), buffer.slice(i * Socket.#bufferSize, (i + 1) * Socket.#bufferSize)]);
                this._pushList.total++;

                if (this._pushList.total === SEQ.key.length){
                    await this._pushing();
                    this._pushList={total:0};
                };
            };

            if (this._pushList.total){
                await this._pushing();
                this._pushList={total:0};
            };

            this._bufferList.shift();
            this.#doWrite().then();
        }else{
            for(let i=0;i<3;i++){
                await new Promise(next=>this.$sendo('SND=5',this._binding,next));
            };
            this.#writing=false;
            this.emit('end');
        };
    };

    async _pushing(){
        await new Promise(next=>{
            this.once('#reciever ready',next);
            this.$sendo(`SND=1${this._pushList.length}`,this._binding);
        });

        await this._doPush();
    };

    async _doPush(seq=SEQ.key){
        for(const i in seq){
            const b=this._pushList[seq[i]];
            if(!b)break;

            await new Promise(next=>this.$sendo(b,this._binding,next));
        };

        const lost=await new Promise(next=>{
            this.once('#received',next);
            this.$sendo(`SND=3${this._pushList.total}`,this._binding);
        });

        if(lost.length)await this._doPush(lost);
    };

    read(size) {
        // return super.read(size);
    };


};

class Server extends EventEmitter{
    _socket;
    $pool;

    constructor() {
        super();
        this.$pool={};
        this._socket=new UDP({type:'udp4'});
        this._socket.on('message',(buf,rmi)=> DEF.route(this,buf,rmi));
    };

    listen(port,ip) {
        this._socket.bind(port,ip);
    };

    $sendo(data,remote,callback){
        const {port,address='localhost'}=remote;
        this.$send(data,port,address,callback);
    };

    $send(data,port,address,callback){
        this._socket.send(data,port,address,callback);
    };
};

module.exports={Server,Socket};