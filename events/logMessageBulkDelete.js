module.exports={name:'messageDeleteBulk',async execute(messages){const logs=require('../utils/logs');for(const message of messages.values())await logs.messageDelete(message);}};
