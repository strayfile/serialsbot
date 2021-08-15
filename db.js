module.exports = function() {
    return (async function() {
        var MongoClient = require('mongodb').MongoClient;
        var url = 'mongodb://localhost:27017';

        var database = await MongoClient.connect(url,{useNewUrlParser: true});
        const db = database.db('KryakozyablikBotDB');
        return db;
    })()
}