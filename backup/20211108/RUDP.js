const {EventEmitter}=require('events');
const {Duplex}=require('stream');
const {Socket:UDP,kStateSymbol}=require('dgram');

const handler={
    ASK:{
        1(buf,rmi){
            const soc=this.constructor===Socket?this:this.getOrCreateSocket(rmi);
            soc.$send('ASK=2',rmi.port,rmi.address);
        },
        2(buf,rmi){
            this._binding=rmi;
            this.$send('ASK=3',rmi.port,rmi.address,()=>{
                this.emit('connected',this);
            });
        },
        3(buf,rmi){
            this._binding=rmi;
            this.emit('connected',this);
        },
        4(buf,rmi){
            this.$send('ASK=5',rmi.port,rmi.address,()=>{
                this._socket.close();
            });
        },
        5(buf,rmi){
            this._socket.close();
        },
    },
    SND:{
        1(buf,rmi){
            this.$cache.pull=[];
            this.$cache.pull.length=buf.slice(5,7).toString();
            this.$send('SND=2');
        },
        2(buf,rmi){
            this.emit('#sending');
        },
        3(buf,rmi){
            const lost=[];
            for(let i=0;i<this.$cache.pull.length;i++){
                if(!this.$cache.pull[i])lost.push(def.pushIndex[i]);
            };
            console.log(lost);

            if(lost.length)this.$send(`SND=4${lost.join('')}`);
            else{
                this.emit('data',Buffer.concat(this.$cache.pull));
                this.$send('SND=4');
            };
        },
        4(buf,rmi){
            if(buf.length===5)this.emit('#next package');
            else this.$pushing(buf.slice(5).toString().split('')).then();
        },
        5(buf,rmi){
            this.$send('SND=6',undefined,undefined,()=>this.emit('end'));
        },
        6(buf,rmi){
            this.emit('end');
        },
    },
    SEQ(buf,rmi){
        //注意删除seq=n
        this.$cache.pull[def.pushNumber[buf.slice(4,5).toString()]]=buf.slice(5);
    },
};

const remote={
    generate(rmi){
        return `${rmi.family}|${rmi.address}|${rmi.port}`;
    },
    compare(A,B){
        return A.family===B.family &&  A.address===B.address &&  A.port===B.port;
    },
};

const def={
    pushIndex:[],
    pushNumber:{},
};
for(let i=0;i<10;i++)def.pushIndex.push(i);
// for(let i=97;i<97+6;i++)def.pushIndex.push(String.fromCodePoint(i));
for(const i in def.pushIndex)def.pushNumber[def.pushIndex[i]]=i;

class Socket extends EventEmitter{
    _socket;
    _binding;
    _connected=false;

    constructor() {
        super();

        this.$cache={
            push:[],
            pull:[],
        };
        this._socket=new UDP({type:'udp4'});
        this._socket.on('message',(buf,rmi)=> {
            //不信任抛弃
            // console.log(buf.slice(0,5).toString());
            if(this._binding && !remote.compare(this._binding,rmi))return;

            const cmd = buf.slice(0, 3).toString();

            if (!handler[cmd]) return;
            else if(handler[cmd].constructor===Function)handler[cmd].call(this,buf,rmi);
            const num = buf.slice(4, 5).toString();

            const fn=handler[cmd][num];
            if(fn)fn.call(this,buf,rmi);

        }).on('close',(...args)=>this.emit('close',...args));

        this._socket.on('connect',()=>this._connected=true);
    };

    connect(port,ip='localhost'){
        this.$send('ASK=1',port,ip);
    };

    $send(data,port,ip,callback){
        if(this._connected)this._socket.send(data,callback);
        else{
            port=port||this._binding.port;
            ip=ip||this._binding.address;
            this._socket.send(data,port,ip,callback);
        };
    };

    destroy(){
        this.$send('ASK=4');
    };

    //替代pipe，懒得写了
    hook(readable){
        readable.once('readable',()=>this.$push(readable));
        return this;
    };

    $cache;

    async $push(readable){
        let data,count=-1;
        do{
            data=readable.read(4096);
            if(data){
                count++;

                if(count===0)this.$cache.push=[];
                this.$cache.push.push(Buffer.concat([Buffer.from(`SEQ=${def.pushIndex[count]}`),data]));
                if(this.$cache.push.length===def.pushIndex.length){
                    await this.#prePush();
                    count=-1;
                };
            }else{
                //end;
                if(this.$cache.push.length)await this.#prePush();
            };
        }while (data);

        this.$send('SND=5');
    };

    #writing=false;
    #task=[];

    write(data){
        if(data===null||data===undefined)return;
        else if(data.constructor===String)data=Buffer.from(data);
        else if(data.constructor!==Buffer){
            throw new Error('Data must be a Buffer like or String.');
        };

        this.#task.push(data);
        if(!this.#writing){
            this.#writing=true;
            this.#write(this.#task[0]).then();
        };
    };

    async #write(data){
        let temp,count=-1;
        for(let i=0;i<def.pushIndex.length;i++){
            count++;
            if(count===0)this.$cache.push=[];
            temp=data.slice(i*4096,(i+1)*4096-1);
            if(temp.length===0)break;

            this.$cache.push.push(Buffer.concat([Buffer.from(`SEQ=${def.pushIndex[count]}`),temp]));
            if(this.$cache.push.length===def.pushIndex.length){
                await this.#prePush();
                count=-1;
            };
        };

        if(this.$cache.push.length)await this.#prePush();
        this.$send('SND=5');

        this.#task.shift();
        if(this.#task.length)this.#write(this.#task[0]).then();
        else{
            this.#writing=false;
            this.emit('end');
        };
    };

    async #prePush(){
        await new Promise(rel=>{
            this.$send(`SND=1${this.$cache.push.length}`,this._binding.port,this._binding.address);
            this.once('#sending',rel);
        });

        await new Promise(rel=>{
            this.$pushing();
            this.once('#next package',rel);
        });

        this.$cache.push.length=0;
    };

    async $pushing(index=def.pushIndex){
        for(const i of index){
            // if(i===3)continue;
            const b=this.$cache.push[def.pushNumber[i]];
            if(!b)break;
            await new Promise(next=>{
                this.$send(b,this._binding.port,this._binding.address,next);
            });
        };

        await new Promise(rel=>{
            this.$send(`SND=3${this.$cache.push.length}`,this._binding.port,this._binding.address,rel);
        });
    };


    pipe(writeable){

    };
};

class Server extends EventEmitter{
    _socket;
    #pool;

    constructor() {
        super();

        this.#pool={};
        this._socket=new UDP({type:'udp4'});
        this._socket.on('message',(buf,rmi)=> {
            const cmd = buf.slice(0, 3).toString();
            if (!handler[cmd]) return ;//console.log(buf.toString());
            const num = buf.slice(4, 5).toString();
            const fn=handler[cmd][num];
            if(fn)fn.call(this,buf,rmi);
        });
    };

    listen(port,ip) {
        this._socket.bind({
            port,address:ip,exclusive:false,
        });
    };

    getOrCreateSocket(rmi){
        const uid=remote.generate(rmi);
        if(!this.#pool[uid]){
            this.#pool[uid]=(new Socket()).once('connected',soc=>this.emit('connect',soc));
        };
        return this.#pool[uid];
    };
};


module.exports={Server,Socket};

