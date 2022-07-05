"use strict"

const _ = require("lodash")
const mongoose = require("mongoose")
const ServiceProvider = require("@haluka/core").ServiceProvider

class MongooseServiceProvider extends ServiceProvider {

    register() {
        this.app.singleton('Haluka/Provider/Mongoose', function (app, { MongooseConfig }) {
            return new MongooseManager(MongooseConfig, app)
        })

        this.app.singleton('Haluka/Provider/Mongoose/ModelBinding', function (app, { MongooseConfig }) {
            return new ModelBinding()
        })
    }
}

class MongooseManager {
    constructor(config, app) {

        this.connections = []
        this.config = config
        this.app = app
        this._booted = false
    }
    async mongoConnect(conf) {
        return await mongoose.createConnection(conf.connString, conf.options).asPromise()
    }
    async setupAll() {
        mongoose.plugin(this._softDeletesPlugin())

        for (var conf in this.config.connections) {
            var connection = this.config.connections[conf]
            this.connections[conf] = await this.mongoConnect(connection)
            this.app.use('Haluka/Core/Events').fire('Database.Connected', conf, connection)
        }
        if (!!this.config['default'] && !!this.config['connections'] && this.config.default in this.config['connections']) {
            this.connections['default'] = this.connections[this.config.default]
        }
        this._booted = true
    }
    booted() {
        return this._booted
    }
    default() {
        return this.connections['default']
    }
    using(conn) {
        if (this.connections[conn])
            return this.connections[conn]
        else
            throw new TypeError(`No database connection exists  with name '${conn}'. Please check your database config.`)
    }
    async close(conn) {
        if (!!this.connections[conn]) {
            await (this.connections[conn]).close();
            this.app.use('Haluka/Core/Events').fire('Database.Closed', conn, this.connections[conn])
        }
    }
    async closeAll() {
        for (var conn in _.omit(this.connections, ['default'])) {
            await this.close(conn)
        }
    }
    _softDeletesPlugin () {
        return (schema) => {
            schema.add({ softDeleted: false })
        }
    }
}
exports.default = MongooseServiceProvider

class ModelBinding {

    static withRoute (req, Model, includeSoftDeletes = false) {

        validateBindingModel(Model)
        validateRequest(req, Model.getRouteParamKey())

        let query = {}
        query[Model.getModelParamKey()] = req.params[Model.getRouteParamKey()]
        
        let item = undefined
        if (Model.binding && typeof(Model.binding) == 'function')
            item = Model.binding(req)
        else
            item = Model.find({ id: req.params[Model.getRouteParamKey()], softDeleted: false })

    }

    static withForm (req, Model)

}

function validateBindingModel (Model) {
    if (!Model.getModelParamKey || typeof(Model.getModelParamKey) !== 'function')
    throw 'Model Identifier not set. Please add a static getModelParamKey() function to your Model.'

    if (!Model.getRouteParamKey || typeof(Model.getRouteParamKey) !== 'function')
    throw 'Route Param Identifier not set. Please add a static getRouteParamKey() function to your Model.'
}

function validateRequest (req, key) {
    if (!req) throw "Invalid Request passed for Model Binding."
    if (!req.params[key]) throw "Route Params doesn't exist"
}

exports.ModelBinding = ModelBinding