const {Server,Socket}=require('./RUDP');
const {createWriteStream}=require('fs');
const {get}=require('http');


const ser=new Server();
ser.on('connect',soc=>{
    // console.log(soc);

    const f=createWriteStream('b.jpg');

    soc.on('data',b=>{
        console.log(b);
        f.write(b);
    }).on('end',()=>{
        f.close();
        console.log('end');
    });

    // soc.destroy();
    soc.once('close',()=>console.log('close'));
});
ser.listen(9981)