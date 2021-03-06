var async               = require('async');
var bcrypt              = require('bcrypt-nodejs');
var Notification        = require('../models/notification.model');
var NotificationByEmail = require('../models/notification-by-email.model');

var Configuration       = require('./configuration');

var NotificationController = {};

NotificationController.get = function (notification_id, callback) {

	// Get full data of the notification
	var notification = {};

	async.series({

		// Get notification data
		getNotification: function (done) {
			Notification.get(notification_id, function (err, data) {
				if (err)
					return done(err);

				notification = data;
				return done();
			})
		},

		// Get user data of the user who emitted the notification
		getUserData: function (done) {
			Notification.getUser(notification.from_id, function (err, data) {
				if (err)
					return done(err);

				delete notification.user_id
				notification.user = data;
				return done();
			});
		},

		// Get loodle data
		getLoodleData: function (done) {
			Notification.getLoodle(notification.doodle_id, function (err, data) {
				if (err)
					return done(err);

				delete notification.doodle_id
				notification.doodle = data;
				return done();
			});
		}
	}, function (err) {
		if (err)
			return callback(err);

		return callback(null, notification);
	});

};

NotificationController.notify = function (loodle_id, current_user_id, callback) {

	// Get the user ids of the loodle minus the current user
	// For each of them get notification and notification_by_email
	// If notification --> create notification 
	// If notification_by_email --> create notification by email

	var users = [];

	async.series({

		// Get the user ids of the loodle minus the current user
		// and the public users
		getUserIdsOfLoodle: function (done) {

			Notification.getUserIdsOfLoodleMinusPublic(loodle_id, function (err, data) {

				if (err)
					return done(err);

				data.forEach(function (user_id) {
					if (user_id !== current_user_id)
						users.push({
							id: user_id
						});
				});

				return done();
			});
		},

		// For each of them get notification and notification_by_email
		getConfiguration: function (done) {

			async.each(users, function (user, end) {
				Configuration.getFromUser(user.id, loodle_id, function (err, configuration) {
					if (err)
						return end(err);

					user.configuration = configuration;
					return end();
				});
			}, done);

		},

		// Send notifications
		sendNotifications: function (done) {

			async.each(users, function (user, end) {

				async.parallel({

					// Send notification if needed
					sendNotification: function (finish) {

						if (user.configuration.notification) {

							var notif = new Notification(current_user_id, loodle_id);
							notif.save(user.id, finish);
	
						}
						else
							return finish();

					},

					// Send notification by email if needed
					sendNotificationByEmail: function (finish) {

						if (user.configuration.notification_by_email)
							NotificationByEmail.send(current_user_id, user.id, loodle_id, finish);
						else
							return finish();

					}
				}, end);

			}, done);
		}

	}, function (err) {
		if (err)
			return callback(err);

		return callback();
	});

};

NotificationController.getFromUser = function (req, res) {

	// Get notification ids from user
	// For each ids
	// Get notifications data
	// For each of them
	// Get user data
	// Get resume doodle data

	var notification_ids = [];
	var notifications = [];

	async.series({

		// Get notification ids from user
		getNotificationIds: function (done) {
			Notification.getIdsFromUser(req.user.id, function (err, data) {
				if (err)
					return done(err);

				notification_ids = data;
				return done(err);
			});
		},

		// For each ids get notification data
		getNotificationsData: function (done) {

			async.eachSeries(notification_ids, function (notification_id, end) {
				NotificationController.get(notification_id, function (err, data) {
					if (err)
						return end(err);

					notifications.push(data);
					return end();
				});
			}, done);

		}

	}, function (err) {
		if (err)
			return error(res, err);

		return success(res, notifications);

	});

};

NotificationController.markAsRead = function (req, res) {

	Notification.markAsRead(req.params.id, function (err) {
		if (err)
			return error(res, err);

		return success(res, 'notification mark as read');
	});

};

NotificationController.getIdsFromLoodle = function (loodle_id, callback) {
	Notification.getIdsFromLoodle(loodle_id, callback);
};

// Delete all the notifications coming from the loodle
NotificationController.deleteFromLoodle = function (loodle_id, callback) {

	// Get notification ids
	// Get user ids

	// For each notification ids, delete the notification
	// For each user ids, delete the notification association
	// Delete the loodle association

	var notification_ids 	= [],
		user_ids 			= [];

	async.series({
		// Get notification ids
		getNotificationIds: function (done) {
			Notification.getIdsFromLoodle(loodle_id, function (err, data) {
				if (err)
					return done(err);

				notification_ids = data;
				return done();
			});
		},

		// Get user ids
		getUserIds: function (done) {

			Notification.getUserIdsOfLoodle(loodle_id, function (err, data) {
				if (err)
					return done(err);

				user_ids = data;
				return done();
			});
		},

		// Delete
		// - notifications
		// - association user - notification
		// - association loodle - notification
		delete: function (done) {

			async.series({

				// Delete notifications
				deleteNotifications: function (end) {

					async.each(notification_ids, function (notification_id, finish) {
						Notification.delete(notification_id, finish);
					}, end);

				},

				// Delete the association user - notification
				deleteAssociationsWithUsers:  function (end) {

					async.each(user_ids, function (user_id, finish) {

						async.each(notification_ids, function (notification_id, next) {
							Notification.deleteAssociationWithUser(user_id, notification_id, next);
						}, finish);

					}, end);

				},

				// Delete the association loodle - notification
				deleteAssociationsWithLoodle: function (end) {

					Notification.deleteAssociationsWithLoodle(loodle_id, end);
				}

			}, done);
		}

	}, callback);
};

NotificationController.delete = function () {

};

module.exports = NotificationController;

function error(res, err) {
	res.status(500);
	res.json({
		type: false,
		data: 'An error occured : ' + err
	});
};

function success(res, data) {
	res.json({
		type: true,
		data: data
	});
};