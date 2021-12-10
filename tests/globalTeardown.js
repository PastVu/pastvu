export default async function () {
    // Stop mongodb-memory-server.
    const instance = global.__MONGOMSINSTANCE__; // eslint-disable-line no-underscore-dangle

    await instance.stop();
}
