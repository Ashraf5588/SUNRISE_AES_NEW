const sendPushNotification = async (token, title, body) => {
  try {
    await admin.messaging().send({
      notification: {
        title: title,
        body: body
      },
      token: token
    });

    console.log("Push sent");
  } catch (err) {
    console.error("Push error:", err);
  }
};