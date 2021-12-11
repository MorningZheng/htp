const {Server} = require('./RUDP');

const $pool={};
// 创建实例
const server = new Server();
server.listen(9100);

const DEF={
    RST:{
        1(buf,rmi){
            const uri=`${rmi.host}:${rmi.port}`,sym=buf.toString();
            $pool[uri]={sym,rmi};
            rmi.tmr=Date.now()+30000;
            this.$sendo('RST=2',rmi);
            // console.log(buf.toString(),rmi);
        },
    },
    CRT:{
        1(buf,rmi){
            const uri=`${rmi.host}:${rmi.port}`;
            const {sym}=$pool[uri]||{};

            if(sym){
                const key=`CRT=2${buf.toString()}`;
                for(const u in $pool){
                    if($pool[u] && $pool[u].sym===sym)this.$sendo(key,$pool[u].rmi);
                };
            };
        },
    }
};

server.on('message',(buf,rmi)=>{
    const cmd=buf.slice(0,3).toString();
    if(!cmd || !DEF[cmd])return;
    else if(DEF[cmd].constructor===Function)DEF[cmd].call(server,buf,rmi);
    else{
        const num=buf.slice(4,5).toString();
        if(DEF[cmd][num].constructor===Function)DEF[cmd][num].call(server,buf.slice(5),rmi,buf);
    };
});

(function fn(){
    const tmr=Date.now();
    for(const s in $pool){
        if($pool[s].tmr<tmr)delete $pool[s];
    };

    setTimeout(fn,10000);
})();