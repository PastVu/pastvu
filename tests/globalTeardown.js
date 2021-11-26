export default async function() {
    // Stop mongodb-memory-server.
    const instance = global.__MONGOMSINSTANCE__;
    await instance.stop();
};
