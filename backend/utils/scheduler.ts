import schedule from 'node-schedule';

export const addJob = () => {
  console.log('add job')
  const job = schedule.scheduleJob('1 * * * *', async () => {
    console.log('The answer to life, the universe, and everything!');
  });
  return job;
}