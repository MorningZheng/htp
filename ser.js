const retry=require('./retry');

const pool=new Map;

const server=new retry();
server.$socket.bind(9999);
server.on('data',(buf,inf)=>{
    if(buf.slice(0,3).toString()==='REG'){
        const key=buf.slice(3).toString();
        if(!pool.has(key))pool.set(key,[]);
        const couple=pool.get(key);
        couple.push(inf);
        if(couple.length>1){
            server.send('INF'+JSON.stringify(couple[1]),couple[0]);
            server.send('INF'+JSON.stringify(couple[0]),couple[1]);
            setTimeout(()=>(couple.length=0,pool.delete(key)),200);
        };
    };
}).on('message',(buf,inf)=>{
    if(buf.slice(0,3).toString()==='REG'){
        const key=buf.slice(3).toString();
        if(!pool.has(key))pool.set(key,[]);
        const couple=pool.get(key);
        couple.push(inf);
        if(couple.length>1){
            server.$socket.send('INF'+JSON.stringify(couple[1]),couple[0].port,couple[0].address);
            server.$socket.send('INF'+JSON.stringify(couple[0]),couple[1].port,couple[1].address);
            setTimeout(()=>(couple.length=0,pool.delete(key)),200);
        };
    };
});