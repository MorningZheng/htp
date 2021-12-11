const HTP=require('./HTP');
const address = 'nesthue.cn', port = 9999;

const a=new HTP(),b=new HTP();
a.reg('test',address,port);
b.reg('test',address,port);

b.on('data',buf=>{
    console.log(buf.toString())
});

a.once('connected',inf=>{
    a.write('hello');
    a.write('hi123');
});