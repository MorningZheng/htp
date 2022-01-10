const HTP=require('./HTP');
const {createWriteStream,createReadStream}=require('fs');
const address = 'nesthue.cn', port = 9999;

const a=new HTP();
a.reg('test',address,port);

a.once('connected',inf=>{
    const read=createReadStream('a.jpg');
    read.on('data',buf=>{
        a.write(buf);
    }).once('end',()=>{
        a.end(()=>a.close());
    });
});
console.log(123123)