const {Socket,Server}=require('./RUDP');

const create=(name,port,host)=>{
    return new Promise(next=>{
        const soc=new Socket();
        soc.link(name,port,host);
        soc.once('waiting',address=>(console.log('network address',address),next(soc)));
    });
};

(async ()=>{
    const host='nesthue.cn',port=9100,name='test';

    const soc=await create(name,port,host);
    soc.on('data',b=>console.log(b.toString()))
    // soc.on('data',b=>console.log(b.toString())).on('end',()=>console.log('end')).write('abcdef');
})();