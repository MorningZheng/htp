const {Socket}=require('./RUDP');
const fs=require('fs');
const {get} = require("http");

const soc=new Socket();


soc.connect(9981);
soc.on('connected',()=>{
   // soc.destroy();
   //  soc.write(123);
    console.log(123123);
    soc.hook(fs.createReadStream('a.jpg')).once('end',()=>soc.destroy());
});
