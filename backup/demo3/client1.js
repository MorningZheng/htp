const {Socket}=require('./RUDP');
const {createReadStream,createWriteStream}=require('fs');
const {Server:TCP}=require('net');

(async ()=>{
    // const host='localhost';
    const host='nesthue.cn';


    const A=new Socket();
    A.link('test',9100,host);
    
    const fa=createReadStream('./a.jpg');
    A.once('connected',(rmi)=>{
        console.log(rmi);
        fa.on('data',buf=>{
            A.write(buf);
            console.log('A',buf);
        }).on('end',()=>A.destroy());
    });
})();