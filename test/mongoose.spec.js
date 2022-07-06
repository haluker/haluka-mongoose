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

test.skip('model binding', async () => {

    let mongo = new MongooseServiceProvider(Haluka.getInstance())
    mongo.register()

    let db = use('Haluka/Provider/Mongoose', { MongooseConfig: testConfig })
    await db.setupAll()

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

let complexSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        first: {
            type: String,
            required: true
        },
        last: String
    },
    age: Number,
    verified: {
        type: Boolean,
        default: false
    },
    dob: Date,
    role: {
        type: mongoose.Types.ObjectId,
    },
    profilePic: Buffer,
    friends: [{
        type: mongoose.Types.ObjectId,
        ref: 'User'
    }]
})

test('model data casting', async () => {
    let mongo = new MongooseServiceProvider(Haluka.getInstance())
    mongo.register()
    let db = use('Haluka/Provider/Mongoose', { MongooseConfig: testConfig })
    await db.setupAll()

    let Model = db.using('conn1').model('User', complexSchema)
    let User = class User extends Model {
        static getModelParamKey () { return 'username' }
        static getRouteParamKey () { return 'username' }
    }
    let binding = await ModelBinding.withForm({
        req: { body: {
            username: 'test-user', 
            'name.first': 'Test',
            'name.last' : 'User', 
            age: 69,
            verified: 1,
            dob: '2022-03-31',
            friends: ['robin']
        } },
        res: {},
        next: () => {}
    }, User, {
        friends: User
    })

    console.log(binding.document)

    await db.closeAll()
})
