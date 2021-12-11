const LUDP = require('lei-udp');
const {EventEmitter}=require('events');

const DEF= {
    route(instance, buf, rmi) {
        const cmd = buf.slice(0, 3).toString();
        if (!DEF[cmd]) return instance.emit('message', buf, rmi);//console.log(buf.toString());
        else if (DEF[cmd].constructor === Function) return DEF[cmd].call(instance, buf, rmi);

        const num = buf.slice(4, 5).toString();
        const fn = DEF[cmd][num];
        if (fn) return fn.call(instance, buf, rmi);
    },
    LNK:{
        1(buf,rmi){
            const symbol=buf.slice(5).toString();
            if(!this.$pool[symbol])this.$pool[symbol]=[];

            const uri=`${rmi.host}:${rmi.port}`;
            rmi.uri=uri;
            if(!this.$pool[symbol][uri])this.$pool[symbol].unshift(this.$pool[symbol][uri]={});
            Object.assign(this.$pool[symbol][uri],rmi);

            this.$sendo(`LNK=2${uri}`,rmi);
            if(this.$pool[symbol].length>1){
                const [a,b]=this.$pool[symbol];

                this.$sendo(`LNK=3${b.uri}`,a,()=>this.$sendo(`LNK=3${a.uri}`,b));

                this.$pool[symbol].length=0;
                this.$pool[symbol]=undefined;
            };
        },
        2(buf, rmi){
            console.log(buf.toString());
            const [host,port]=buf.slice(5).toString().split(':');
            this._remote={host,port};
        },
        3(buf, rmi){
            //交换IP地址
            const [host,port]=buf.slice(5).toString().split(':');
            this.$send(`LNK=4${this._remote.host}:${this._remote.port}`,port,host);
        },
        4(buf,rmi){
            if(this._binding)return;
            this._binding=rmi;
            this.emit('connected',rmi);
            // console.log(this._binding,buf.toString(),rmi);
        },
    },
    SND:{
        1(buf,rmi){
            this._pulling=true;
            this._pullList={total:0};
            this.$sendo('SND=2',rmi);
        },
        2(buf,rmi){
            // console.log(buf.toString());
            this.emit('#receiverReady');
        },
        3(buf,rmi){
            const len=parseInt(buf.slice(5).toString());
            if(len===this._pullList.total){
                const data=[];
                for(let i=0;i<len;i++)data.push(this._pullList[SEQ.key[i]]);
                this.emit('data',Buffer.concat(data));
                data.length=0;
                this._pullList=undefined;
                this._pulling=false;

                this.$sendo('SND=4',rmi);
            } else{
                const lost=[];
                for(let i=0;i<len;i++){
                    const idx=SEQ.key[i];
                    if(!this._pullList[idx])lost.push(idx);
                };

                this.$sendo(`SND=4${lost.join('')}`,rmi);
            };
        },
        4(buf,rmi){
            this.emit('#received',buf.slice(5).toString().split(''));
        },
    },
    SEQ(buf,rmi){
        const idx=buf.slice(4,5).toString();
        if(!this._pullList[idx]){
            this._pullList[idx]=buf.slice(5);
            this._pullList.total++;
        };
    },
    CLS:{
        1(buf,rmi){
            this.$sendo('CLS=2',rmi,()=>this._closed=true);
        },
        2(buf,rmi){
            this._closed=true;
            process.nextTick(()=>this.$socket.exit());
        },
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
    $socket;
    _remote;
    _binding;

    constructor() {
        super();
        this.$socket= new LUDP({
            type: 'udp4',             // 网络类型，可选udp4或udp6
            responseTimeout: 12000,   // 确认消息超时时间
            cacheTimeout: 90000,      // 缓存时间
            cleanCacheInterval: 200,  // 清理缓存程序执行时间间隔
            maxMessageSize: 548,      // UDP数据包最大长度
        });

        this.$socket.on('data', (rmi, buf)=>DEF.route(this,buf,rmi)).on('exit',code=>this.emit('close',code));
    };

    $sendo(data,remote,callback){
        const {port,host='localhost'}=remote;
        this.$send(data,port,host,callback);
    };

    $send(data,port,address,callback){
        // console.log(...arguments)
        if(data.toString()==='CLS=1' && this._closed)return;
        this.$socket.sendR.call(this.$socket,address,port,data,callback);
    };

    link(symbol,serverPort,serverIP='localhost'){
        this.$send(`LNK=1${symbol}`,serverPort,serverIP);
    };

    destroy(force=false){
        if(!force && (this._pulling||this._pushing)){
            this.once('stateChanged',()=>this.destroy());
        }else this.$sendo('CLS=1',this._binding,);
    };

    _pullList;
    _bufferList;

    _$pushing;
    get _pushing(){
        return this._$pushing;
    };
    set _pushing(val){
        if(val!==this._$pushing){
            this._$pushing=val;
            this.emit('stateChanged',val,'push');
        };
    };

    _$pulling;
    get _pulling(){
        return this._$pulling;
    };
    set _pulling(val){
        if(val!==this._$pulling){
            this._$pulling=val;
            this.emit('stateChanged',val);
            this.emit('stateChanged',val,'pull');
        };
    };

    write(chunk, encoding, callback){
        if(chunk===null || chunk===undefined)return false;
        if(chunk.constructor===String)chunk=Buffer.from(chunk);
        else if(chunk.constructor!==Buffer){
            const e=new Error('Data must be String or Buffer.');
            if(callback)callback(e);
            else{
                throw e;
            };
        };

        if(!this._bufferList)this._bufferList=[];
        this._bufferList.push(chunk);

        if(!this._pushing){
            this._pushing=true;
            this.$splitChunk().then();
        };

        return true;
    };

    static #bufferSize=2048;
    _pushList;
    async $splitChunk(){
        if(this._bufferList.length){
            const buffer=this._bufferList[0];
            this._pushList={total:0};

            for(let i=0,n=0;i<Math.ceil(buffer.length/Socket.#bufferSize);i++,n++) {
                const idx = SEQ.key[n];
                this._pushList[idx] = Buffer.concat([SEQ.head, Buffer.from(idx), buffer.slice(i * Socket.#bufferSize, (i + 1) * Socket.#bufferSize)]);
                this._pushList.total++;

                if (this._pushList.total === SEQ.key.length){
                    await this.$pushChunk();
                    this._pushList={total:0};
                    n=-1;
                };
            };

            if (this._pushList.total){
                await this.$pushChunk();
                this._pushList={total:0};
            };

            this._bufferList.shift();
            setTimeout(()=>this.$splitChunk().then(),10);
        }else{
            this._pushing=false;
            this.emit('end');
        };
    };

    $pushChunk(){
        return new Promise(rel=>{
            this.once('#receivecomplete',rel);
            this.once('#receiverReady',()=>this.$pushWorking());
            this.$sendo('SND=1',this._binding);
        });
    };

    async $pushWorking(seq=SEQ.key){
        for(const i in seq){
            const b=this._pushList[seq[i]];
            if(!b)break;

            //直接全部不校验发送
            await new Promise(next=>this.$socket.send(this._binding.host,this._binding.port,b,next));
        };

        const lost=await new Promise(async next=>{
            this.once('#received',next);
            this.$sendo(`SND=3${this._pushList.total}`,this._binding);
        });

        if(lost.length)await this.$pushWorking(lost);
        else this.emit('#receivecomplete');
    };

};

class Server extends EventEmitter{
    $socket;
    $pool;

    constructor(port, host='localhost') {
        super();

        this.$socket= new LUDP({
            port, host,
            type: 'udp4',             // 网络类型，可选udp4或udp6
            responseTimeout: 12000,   // 确认消息超时时间
            cacheTimeout: 90000,      // 缓存时间
            cleanCacheInterval: 200,  // 清理缓存程序执行时间间隔
            maxMessageSize: 548,      // UDP数据包最大长度
        });
        this.$pool={};

        this.$socket.on('data', (rmi, buf)=>DEF.route(this,buf,rmi));
    };

    listen(port, host='localhost', callback){
        // console.log(this.$socket);
        this.$socket._socket.bind(...arguments);
    };

    $sendo(data,remote,callback){
        const {port,host='localhost'}=remote;
        this.$send(data,port,host,callback);
    };

    $send(data,port,address,callback){
        this.$socket.send(address,port,data,callback);
    };
};

module.exports={Server,Socket};