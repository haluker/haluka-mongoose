"use strict"

const _ = require("lodash")
const mongoose = require("mongoose")
const ServiceProvider = require("@haluka/core").ServiceProvider

class MongooseServiceProvider extends ServiceProvider {

    register() {
        this.app.singleton('Haluka/Provider/Mongoose', function (app, { MongooseConfig }) {
            return new MongooseManager(MongooseConfig, app)
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
}
exports.default = MongooseServiceProvider