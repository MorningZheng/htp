const {Socket}=require('./RUDP');
const {createReadStream,createWriteStream}=require('fs');
const {Socket:TCP}=require('net');

(async ()=>{
    // const host='localhost';
    const host='nesthue.cn';

    const fb=createWriteStream('c.jpg');

    const B=new Socket();
    B.link('test',9100,host);
    B.on('data',buf=>fb.write(buf)).once('close',()=>fb.close());


    // B.once('connected',(rmi)=>{
    //     console.log(rmi);
    //     const tcp=new TCP();
    //     tcp.on('data',buf=>B.write(buf)).once('close',()=>B.destroy());
    //     tcp.connect(80,'localhost',()=>{
    //         B.on('data',buf=>tcp.write(buf)).once('close',()=>tcp.destroy());
    //     });
    // });
})();