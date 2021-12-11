const {Socket:UDP}=require('./RUDP');
const {createReadStream,createWriteStream}=require('fs');

const crypto = require('crypto');
const md5=(...text)=>crypto.createHash('md5').update(text.join('')).digest('hex');

const DEF={
    RST:{
        2(buf,rmi){
            this.emit('connected');
        },
    },
    CRT:{
        2(buf,rmi){
            const soc=new UDP(),key=buf.toString();
            soc.link(key,rmi.port,rmi.host);
            soc.once('connected',rmi=>{
                this.emit('connection',soc,key);
                const event=`#connection${key}`;
                this.emit(event,soc);
            });
        },
    }
};

(async ()=>{
    const [host,port]=['nesthue.cn',9100];
    const serA=new UDP(),serB=new UDP();


    serA.createSocket=(callback)=>{
        const key=md5(Math.random(),Date.now(),Math.random());
        serA.$send('CRT=1'+key,port,host);
        if(callback)serA.once(`#connection${key}`,soc=>callback(soc,key));
    };

    for(const soc of [serA,serB]){
        soc.on('message',(buf,rmi)=>{
            const cmd=buf.slice(0,3).toString();
            if(!cmd || !DEF[cmd])return;
            else if(DEF[cmd].constructor===Function)DEF[cmd].call(soc,buf,rmi);
            else{
                const num=buf.slice(4,5).toString();
                if(DEF[cmd][num].constructor===Function)DEF[cmd][num].call(soc,buf.slice(5),rmi,buf);
            };
        });
        // soc.on('connection',soc=>console.log('connection'));

        await new Promise(next=>{
            soc.once('connected',next);
            soc.$send('RST=1test',port,host,);
        });
    };

    serB.on('connection',(soc,key)=>{
        const f=createWriteStream(`${key}.jpg`);
        soc.on('data',buf=>f.write(buf)).once('close',()=>{
            f.close();console.log('close',key);
        });
        soc.write('abcabcabc');
    });

    serA.createSocket((soc,key)=>{
        console.log('A',key)
        const f=createReadStream('a.jpg');
        f.on('data',buf=>soc.write(buf)).once('end',()=>soc.destroy());
        soc.on('data',buf=>console.log(buf.toString()));
    });



})();