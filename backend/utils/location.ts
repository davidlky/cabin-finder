import axios from 'axios';
import dayjs from 'dayjs';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import { db } from '../../models';
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type DateAvailability = {
  date: dayjs.Dayjs;
  availabilty: boolean;
};
type DateSummary = {
  availabilities: dayjs.Dayjs[];
  id: number;
  name: string;
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

  const summary: DateSummary[] = [];

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
      range: 1,
    },
    {
      name: 'Runde',
      id: '6761',
      startDate: dayjs('2021-05-01'),
      endDate: dayjs('2021-09-01'),
      range: 2,
    },
  ];

  for (const cabin of cabins) {
    const availabilities: DateSummary[] = await getLocationAvailability(cabin.id, cabin.startDate, cabin.endDate);

    let html = '';
    for (const availability of availabilities) {
      // get diff
      const currentAvailability = await db.HytteLog.findAll({
        where: {
          hytteId: `${availability.id}`,
        },
      });

      const availabilityStringSet = new Set<string>(
        availability.availabilities.map((el) => el.format('YYYY-MM-DD'))
      );
      const pastAvailabilitySet = new Set<string>();

      currentAvailability
        .map((el: any) => el.availableDate)
        .forEach((date: string) => {
          if (!availabilityStringSet.delete(date)) {
            pastAvailabilitySet.add(date);
          }
        });

      if (pastAvailabilitySet.size !== 0 || availabilityStringSet.size !== 0) {
        html += `<p>${availability.name}</p>`;

        if (pastAvailabilitySet.size !== 0) {
          const dates = Array.from(pastAvailabilitySet);
          html += `<p>Booked</p><ul>`;
          html += dates
            .map((date) => dayjs(date).format('YYYY-MM-DD ddd'))
            .map((el) => `<li>${el}</li>`)
            .join('');
          html += `</ul>`;

          await db.HytteLog.destroy({
            where: {
              hytteId: `${availability.id}`,
              availableDate: dates,
            },
          });
        }
        if (availabilityStringSet.size !== 0) {
          const dates = [...availability.availabilities];
          dates.sort((a, b) => (a.isAfter(b) ? 1 : -1));
          const dateRanges = dates.reduce((prev, el) => {
            if (prev.length === 0) {
              return prev.concat({ date: el, range: 1 });
            }
            const latestRange = prev[prev.length - 1];
            if (
              el.format('YYYY-MM-DD') ===
              latestRange.date.add(latestRange.range, 'day').format('YYYY-MM-DD')
            ) {
              prev[prev.length - 1].range += 1;
              return prev;
            } else {
              return prev.concat({ date: el, range: 1 });
            }
          }, [] as { date: dayjs.Dayjs; range: number }[]);
          html += `<p>Bookable</p><ul>`;
          html += dateRanges
            .filter((el) => el.range >= cabin.range)
            .map((range) => `${dayjs(range.date).format('YYYY-MM-DD ddd')} - ${range.range} Day(s)`)
            .map((el) => `<li>${el}</li>`)
            .join('');
          html += `</ul>`;

          await db.HytteLog.bulkCreate(
            Array.from(availabilityStringSet).map((date) => ({
              hytteId: `${availability.id}`,
              availableDate: date,
            }))
          );
        }
      }
    }

    if (html.length > 0) {
      console.log(`emailing for ${cabin.name} - ${cabin.id}`);
      await sgMail.send({
        to: email, // Change to your recipient
        from: 'no-reply@mapper.world', // Change to your verified sender
        subject: `Hytta Update - ${cabin.name}`,
        html,
      });
      console.log(`done emailing for ${cabin.name} - ${cabin.id}`);
      // TODO send email
    }
  }
};

fetchDataForCabins();
