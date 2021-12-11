// const UTP = require("utp-native");
const retry=require('./retry');
const UTP=require('./UTP');
const {createReadStream,createWriteStream}=require('fs');

const address='nesthue.cn';

let abc=undefined;
{
    let couple=undefined;

    const re=new retry();
    re.send('REGS',{address,port:9999});
    re.on('data',(buf,inf)=>{
        if(buf.slice(0,3).toString()==='INF'){
            const rmt=JSON.parse(buf.slice(3));
            // console.log('b',rmt);
            abc=()=>{
                re.$socket.send('hello',rmt.port,rmt.address);
            };
        //     couple=new UTP(re);//JSON.parse(buf.slice(3))
        //     let file;
        //     couple.on('data',buf=>{
        //         console.log(buf.toString());
        //         // couple.write('123123');
        //         file.write(buf);
        //     // }).on('end',e=>{
        //     //     console.log('end',222);
        //     //     file.close();
        //     //     couple.close();
        //     //     console.log('s close');
        //     // }).on('connection',inf=>{
        //     //     file=createWriteStream('b.jpg');
        //     });
        };
    });
    re.$socket.on('message',buf=>{
        console.log(buf.toString());
    });
}

{
    let couple=undefined;
    const re=new retry();
    re.send('REGC',{address,port:9999});
    re.on('data',(buf,inf)=>{
        if(buf.slice(0,3).toString()==='INF'){
            const rmt=JSON.parse(buf.slice(3));
            re.send('hello',rmt);

            // couple=new UTP(re);
            // const rmt=JSON.parse(buf.slice(3));
            // couple.connect(rmt,()=>{
            //     couple.write('hello');
            //     // const file=createReadStream('a.jpg');
            //     // file.on('data',buf=>{
            //     //     couple.write(buf);
            //     // });
            //     // file.on('end',()=>{
            //     //     couple.end();
            //     // })
            // }).on('close',()=>{
            //     // console.log('c close');
            //     // couple.close();
            // });
        };
    });
}