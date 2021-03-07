import axios from 'axios';
import dayjs from 'dayjs';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type DateAvailability = {
  date: dayjs.Dayjs;
  availabilty: boolean;
};

export const getLocationAvailability = async (
  locationId: string,
  startDate: dayjs.Dayjs,
  toDate: dayjs.Dayjs,
  selectedIds: number[] = []
) => {
  const response = await axios.get(`https://ws.visbook.com/8/api/${locationId}/webproducts`);

  let ids = response.data.map((el: { webProductId: number; unitName: string }) => ({
    id: el.webProductId,
    name: el.unitName,
  }));

  if (selectedIds.length !== 0) {
    ids = ids.filter(({ id }: { id: number }) => selectedIds.includes(id));
  }

  const months: number[] = [];

  for (let month = startDate.month(); month < toDate.month(); month += 1) {
    months.push(month + 1);
  }

  const summary = [];

  for (const { id, name } of ids) {
    const availabilities = await Promise.all(
      months.map(async (month) => {
        const availability = await axios.get(
          `https://ws.visbook.com/8/api/${locationId}/availability/${id}/${toDate.format(
            'YYYY'
          )}-${month}`
        );
        const allDays: DateAvailability[] = availability.data.items.map((el: any) => ({
          date: dayjs(el.date),
          availability: el.webProducts[0]?.availability?.available || false,
        }));

        const availableDays = allDays.filter((el: any) => el.availability === true);

        console.log(
          `checking ${locationId} - ${name}(${id}) - Month ${month}: ${availableDays.length} / ${allDays.length} available`
        );
        return availableDays;
      })
    );

    summary.push({
      availabilities: availabilities.reduce((prev: dayjs.Dayjs[], current: DateAvailability[]) => {
        return prev.concat(current.map((el: DateAvailability) => el.date));
      }, []),
      id: id,
      name: name,
    });
  }

  return summary;
};

export const fetchDataForCabins = async (email = 'david.lky.123@gmail.com') => {
  const cabins = [
    {
      name: 'Flokehyttene',
      id: '6446',
      startDate: dayjs('2021-05-01'),
      endDate: dayjs('2021-09-01'),
    },
  ];

  for (const cabin of cabins) {
    const availabilities = await getLocationAvailability(cabin.id, cabin.startDate, cabin.endDate);

    if (availabilities.some((el) => el.availabilities.length !== 0)) {
      console.log(`emailing for ${cabin.name} - ${cabin.id}`);
      await sgMail.send({
        to: email, // Change to your recipient
        from: 'no-reply@mapper.world', // Change to your verified sender
        subject: `Hytta Update - ${cabin.name}`,
        html: availabilities
          .map(
            (el) =>
              `<p>${el.name}</p><ul>${el.availabilities.map(
                (el) => `<li>${el.format('YYYY-MM-DD ddd')}</li>`
              )}</ul>`
          )
          .join('\n'),
      });
      console.log(`done emailing for ${cabin.name} - ${cabin.id}`);
      // TODO send email
      console.log(availabilities);
    }
  }
};

fetchDataForCabins();