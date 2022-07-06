const { default: mongoose } = require('mongoose')

const MongooseServiceProvider = require('..').default
const ModelBinding = require('..').ModelBinding
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

test('model binding', async () => {

    let mongo = new MongooseServiceProvider(Haluka.getInstance())
    mongo.register()

    let db = use('Haluka/Provider/Mongoose', { MongooseConfig: testConfig })
    await db.setupAll()

    let schema = new mongoose.Schema({
        username: {
            type: String,
            required: true
        },
        fullName: {
            type: String,
            required: false,
        }
    })
    let Model = db.using('conn1').model('Test', schema)
    Model.getModelParamKey = () => 'username'
    Model.getRouteParamKey = () => 'username'
    let binding = ModelBinding.withForm({
        req: { body: { username: 'test-user', fullName: 'Test User', age: 69 } },
        res: {},
        next: () => {}
    }, Model)

    expect(binding.document).toHaveProperty('username', 'test-user')
    expect(binding.document).toHaveProperty('fullName', 'Test User')
    expect(binding.document).not.toHaveProperty('age')
    expect(binding.document).toHaveProperty('_id')
    expect(binding.document).toHaveProperty('softDeleted', false)

    await db.closeAll()
})

