const Sequelize = require('sequelize')
const {INTEGER} = Sequelize
const conn = new Sequelize(process.env.DATABASE_URL || 'postgres://localhost/tweeter_db')
const express = require('express')
const app = express()
const { createClient } = require('redis');
const {VIRTUAL}=require('sequelize')

const redisClient = createClient();

const Tweet = conn.define('tweet', {
	likeCountKey: {
		type: VIRTUAL,
		get: function() {
			return `Tweet-${this.id}`
		}
	}
})

const Like = conn.define('like', {
	tweetId: {
		type: INTEGER,
		allowNull: false
	}
})

Tweet.prototype.likeCount = async function(){
	const count = await redisClient.get(this.likeCountKey) || 0
	return count*1
}

Like.addHook('afterCreate', async(like) => {
	const tweet = await Tweet.findByPk(like.tweetId)
	await redisClient.incr(tweet.likeCountKey)
})

Like.belongsTo(Tweet)
Tweet.hasMany(Like)


app.get('/:id', async(req, res, next)=> {
	try {
		const tweet = await Tweet.findByPk(req.params.id)
		res.send({...tweet.get(), likeCount: await tweet.likeCount()})
	} catch (error) {
		next(errors)
	}
})



const init = async() => {
	try {
		await conn.sync({force: true})
		await redisClient.connect();
		await redisClient.flushAll()
		let tweet = await Tweet.create()
		const limit = 500
		await Promise.all(new Array(50).fill('').map(() => Like.create({tweetId: tweet.id})))

		tweet = await Tweet.findByPk(tweet.id, {include:[Like]})
		console.log(tweet.likes.length)
		console.log(await tweet.likeCount())
		await Tweet.create()

		//redisClient.on('error', (err) => console.log('Redis Client Error', err));

		const port = process.env.PORT || 3000
		app.listen(port, () => console.log(`listening on port ${port}`))
	} catch (error) {
		console.log(error)
	}
}
init() 