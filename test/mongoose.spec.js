
const MongooseServiceProvider = require('../').default
const Haluka = require('@haluka/core').Application

let testConfig = {
    connections: {
        conn1: {
            connString: 'mongodb://localhost:27017/test'
        }
    }
}

test('setup database and close connections', async () => {

    let mongo = new MongooseServiceProvider(Haluka.getInstance())
    mongo.register()

    let db = use('Haluka/Provider/Mongoose', { MongooseConfig: testConfig })
    
    await db.setupAll()
    await db.closeAll()
})

