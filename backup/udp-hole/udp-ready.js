const dgram = require('dgram');
const UTP=require('./UTP');
const retry=require('./retry');

const address = 'nesthue.cn', port = 9999;

function send (socket,address, port,text,count=-1) {
    count++;
    if(count>5)return;

    // console.log('sending UDP message to A:', address +':'+ port);
    const message = Buffer.from('Hello '+text+`${count}`+'!');
    socket.send(message, 0, message.length, port, address, function (err, nrOfBytesSent) {
        if (err) return console.log(err);
        // console.log('UDP message sent to '+text+':', address +':'+ port);

        setTimeout(function () {
            send(socket,address, port,text,count);
        }, 2000);
    });
}

const _new=(name)=>{
    return new Promise(rel=>{
        const socket = dgram.createSocket('udp4');
        const message = Buffer.from(name);
        socket.send(message, 0, message.length, port, address, function (err, nrOfBytesSent) {
            if (err) return console.log(err);
            rel(socket);
        });

        socket.once('message', function (message, remote) {
            if(message.slice(0,3).toString()==='INF'){
                socket.remote=JSON.parse(message.slice(3).toString());
                socket.emit('ready');
            };
        });
    });
};

(async ()=>{
    const a=await _new('REGC'),b=await _new('REGS');

    await new Promise(rel=>{
        let i=0;
        const fn=()=>{
            i++;
            if(i===2)rel();
        };
        a.once('ready',fn);
        b.once('ready',fn);
    });

    for(const s of [a,b]) s.send('PING',s.remote.port,s.remote.address);

    const ra=new retry({socket:a}),rb=new retry({socket:b});
    ra.on('data',buf=>console.log(buf.toString()));

    const fn=(idx=0)=>{
        idx++;
        if(idx>5)return;
        rb.send('hello'+idx,b.remote);
        setTimeout(fn,1000,idx);
    };
    fn();


})();