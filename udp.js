const HTP=require('./HTP');
const {createWriteStream,createReadStream}=require('fs');
const address = 'nesthue.cn', port = 9999;

const a=new HTP(),b=new HTP();
a.reg('test',address,port);
b.reg('test',address,port);

let file;
b.on('data',buf=>{
    // console.log(buf)
    file.write(buf);
}).on('connect',inf=>{
    console.log(inf);
    file=createWriteStream('b.jpg');
}).on('end',()=>{
    console.log('end');
    file.close();
}).on('close',()=>{
    console.log('b close');
    b.close();
});

a.once('connected',inf=>{
    const read=createReadStream('a.jpg');
    read.on('data',buf=>{
        a.write(buf);
    }).once('end',()=>{
        a.end(()=>a.close());
    });
    // a.write('hello');
    // a.once('drain',()=>{
    //     a.write('hi123');
    // });
});