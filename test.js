const UTP = require("utp-native");
const {createWriteStream,createReadStream}=require('fs');

const port=9999,host='localhost';

{
    const socket=UTP();
    socket.listen(port,host);
    socket.on('connection',(soc,inf)=>{
        // soc.on('data',buf=>console.log(buf));
        // soc.on('data', function (data) {
        //     // console.log('echo: ' + data)
        // })
        const file=createWriteStream('b.jpg');
        soc.pipe(file);
        soc.on('end', function () {
            console.log('echo: (ended)');
            soc.destroy();
        });
        soc.on('close',()=>console.log('closed'));
    });


    // socket.on('message',buf=>console.log(buf.toString()))
    // socket.on('message',buf=>console.log('utp',buf.toString()));
    // socket.socket.on('message',buf=>console.log('udp',buf.toString()));
}

{
    const socket=UTP();
    const connect=socket.connect(port,host);
    // socket.write('hello world')
    // socket.end()
    const file=createReadStream('a.jpg');
    file.pipe(connect)
    file.on('end', () => {
        connect.end();
    });
}