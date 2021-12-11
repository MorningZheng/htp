const {Socket,Server}=require('./RUDP');
const {get} = require("http");
const DEF=[Buffer.from('REG=1'),Buffer.from('REG=2')];
const fs=require('fs');

const host='nesthue.cn';

const remote=uid=>{
    return new Promise(rel=>{
        get(`http://${host}:39263/pool/p2p?uid=${uid}`,imc=>{
            const data=[];
            imc.on('data',b=>data.push(b)).once('end',()=>{
                try{
                    rel(JSON.parse(Buffer.concat(data).toString()))
                }catch (e){
                    rel(null);
                };
            });
        });
    });
};

const connect=uid=>{
    return new Promise(rel=>{
        const soc=new Socket();
        soc._socket.send(Buffer.concat([DEF[0],Buffer.from(uid)]),39263,host);
        setTimeout(()=>{
            remote(uid).then(r=>(soc._remote=r,rel(soc)));
        },200);
    });
}

(async ()=>{
    const A=await connect('test:1');
    const B=await connect('test:2');

    console.log(A._remote,B._remote);

    for(let i=0;i<2;i++){
        A.$send(DEF[0],B._remote.port,B._remote.address);
        await new Promise(rel=>setTimeout(rel,100));
        B.$send(DEF[0],A._remote.port,A._remote.address);
        await new Promise(rel=>setTimeout(rel,100));
    };

    await new Promise(next=>A._socket.connect(B._remote.port,B._remote.address,next))
    await new Promise(next=>B._socket.connect(A._remote.port,A._remote.address,next));
    A._binding=B._remote;
    B._binding=A._remote;
    console.log('ready');

    // const f=fs.createWriteStream('b.jpg');
    // B.on('data',b=>{
    //     console.log(b);
    //     f.write(b);
    // }).on('end',()=>{
    //     f.close();
    //     console.log('end');
    //     B.destroy();
    // });
    // A.hook(fs.createReadStream('a.jpg')).once('end',()=>A.destroy());

    // fs.createReadStream('a.jpg').on('data',b=>A.write(b)).on('end',()=>console.log('end'));
    B.on('data',buf=>console.log(123,buf.toString()));
    A.on('connected',()=>{
        A.write('abc')
    });


    // A.on('data',buf=>console.log('from B:',buf.toString()));
    // B.on('data',buf=>console.log('from A:',buf.toString()));
    //
    // A.write('abc');

    // A._binding=B._remote;
    // B._binding=A._remote;
    //
    // A.on('connected',()=>{
    //     A.hook(fs.createReadStream('a.jpg')).once('end',()=>A.destroy());
    // });
    // // A._socket.on('message',b=>console.log(b.slice(0,5).toString()));
    // B.on('connected',()=>{});
    // const f=fs.createWriteStream('b.jpg');
    //
    // // B._socket.on('message',b=>console.log(b.slice(0,5).toString()));
    // B.on('data',b=>{
    //     console.log(b);
    //     f.write(b);
    // }).on('end',()=>{
    //     f.close();
    //     console.log('end');
    //     B.destroy();
    // });
    //
    // A.hook(fs.createReadStream('a.jpg')).once('end',()=>A.destroy());
    //
    // A.on('connected',()=>{
    //     A.write('abc')
    // });
    // B.on('data',buf=>console.log(123,buf.toString()));
    //
    // A.connect(B._remote.port,B._remote.address);
})();