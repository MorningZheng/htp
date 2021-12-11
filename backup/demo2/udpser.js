const {Socket,Server}=require('./RUDP');
const ser=new Server();
ser.listen(9100);