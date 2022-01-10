const HTP=require('./HTP');
const {createWriteStream,createReadStream}=require('fs');
const address = 'nesthue.cn', port = 9999;

const b=new HTP();
b.reg('test',address,port);

let file;
b.on('data',buf=>{
    console.log(buf)
    file.write(buf);
}).on('connect',inf=>{
    console.log(inf);
    file=createWriteStream('b.jpg');
}).on('end',()=>{
    console.log('end');
    file.close();
});