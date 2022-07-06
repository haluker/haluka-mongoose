"use strict"

const _ = require("lodash")
const mongoose = require("mongoose")
const createError = require("http-errors")
const ServiceProvider = require("@haluka/core").ServiceProvider

class MongooseServiceProvider extends ServiceProvider {

    register() {
        this.app.singleton('Haluka/Provider/Mongoose', function (app, { MongooseConfig }) {
            if (!MongooseConfig) throw 'Database not configured. Please add a database config file in config directory or specify a MongooseConfig object during resolution.'
            return new MongooseManager(MongooseConfig, app)
        })

        this.app.singleton('Haluka/Provider/Mongoose/ModelBinding', function (app) {
            return ModelBinding
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
        return this.using('default')
    }
    using(conn) {
        if (!this._booted)
            throw Error(`Database not yet booted. Possible reasons might be unavailability of database config.`)

        if (this.connections[conn])
            return this.connections[conn]
        else
            throw new TypeError(`No database connection exists  with name '${conn}'. Please check your database config.`)
    }
    async close(conn) {
        if (!this._booted)
            throw Error(`Database not yet booted. Possible reasons might be unavailability of database config.`)

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

    constructor (Model, document, ctx) {
        this.Model = Model
        this.document = document
        this.ctx = ctx
    }

    static async withRoute (ctx, Model, includeSoftDeletes = false) {

        validateBindingModel(Model) 
        validateRequest(ctx.req, Model.getRouteParamKey())

        let query = {}
        query[Model.getModelParamKey()] = ctx.req.params[Model.getRouteParamKey()]
        if (includeSoftDeletes == false) query['softDeleted'] = false

        let item = undefined
        if (Model.binding && typeof(Model.binding) == 'function')
            item = await Model.binding(ctx,req)
        else
            item = await Model.findOne(query)
        
        return new ModelBinding(Model, item, ctx)
    }

    static withForm (ctx, Model) {
        validateBindingModel(Model)

        if (!ctx.req.body) throw 'Cannot parse body. Do you have a proper body parser for this request?'
        let modelFields = Model.schema.paths
        let requiredFields = Object.values(modelFields).filter(x => x.isRequired == true).map(x => x.path)
        if (!requiredFields.every(x => Object.keys(ctx.req.body).includes(x)))
            throw createError(400)
        
        let document = new Model(_.pick(ctx.body), requiredFields)
        return new ModelBinding(Model, document, ctx)
    }

    handleResponse (respond = undefined) {
        if (!this.document) return this.ctx.next(createError(404))
        if (respond && typeof respond === 'function') return respond(this.document)
        this.ctx.res.status(200).json({ status: "success", data: this.document.lean() })
    }

    async updateDocument (newValues, respond = undefined) {
        if (!this.document) return this.ctx.next(createError(401))
        try {
            for (let field in Object.keys(newValues)) {
                this.document[field] = newValues[field]
            }
            await this.document.save()
        } catch (err) {
            if (!this.ctx.res.locals) this.ctx.res.locals = {}
            this.ctx.res.locals.errors = err
            return next(createError(500, err.message))
        } finally {
            if (respond && typeof respond === 'function') return await respond(this.document)
            this.ctx.res.status(200).json({ status: "success", message: `${this.document.constructor.modelName} updated successfully.` })
        }
    }

    async deleteDocument (isSoftDelete = true, respond = undefined) {
        if (!this.document) return this.ctx.next(createError(401))
        try {
            if (isSoftDelete) {
                this.document.softDeleted = true
                await this.document.save()
            } else {
                await this.document.delete()
            }
        } catch (err) {
            if (!this.ctx.res.locals) this.ctx.res.locals = {}
            this.ctx.res.locals.errors = err
            return next(createError(500, err.message))
        } finally {
            if (respond && typeof respond === 'function') return await respond(this.document)
            this.ctx.res.status(200).json({ status: "success", message: `${this.document.constructor.modelName} deleted successfully.` })
        }
    }

    async saveDocument (respond = undefined) {
        if (!this.document) return this.ctx.next(createError(401))
        try {
            await this.document.save()
            if (respond && typeof respond === 'function') return await respond(this.document)
            this.ctx.res.status(200).json({ status: "success", message: `${this.document.constructor.modelName} created successfully.` })
        } catch (error) {
            if (!this.ctx.res.locals) this.ctx.res.locals = {}
            this.ctx.res.locals.errors = error
            if (!respond)
                return this.ctx.res.status(500).json({ status: "error", error: error.message })
            await respond(error)
        }
    }

    async validate () {
        try {
            await this.document.validate()
            return true
        } catch (error) {
            if (!this.ctx.res.locals) this.ctx.res.locals = {}
            this.ctx.res.locals.errors = error.errors
            return error
        }
    }

}

function validateBindingModel (Model) {
    if (!Model.getModelParamKey || typeof(Model.getModelParamKey) !== 'function')
    throw 'Model Identifier not set. Please add a static getModelParamKey() function to your Model.'

    if (!Model.getRouteParamKey || typeof(Model.getRouteParamKey) !== 'function')
    throw 'Route Param Identifier not set. Please add a static getRouteParamKey() function to your Model.'
}

function validateRequest (req, key) {
    if (!req) throw createError(400)
    if (!req.params[key]) throw createError(400)
}

exports.ModelBinding = ModelBinding