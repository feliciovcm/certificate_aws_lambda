import {join} from 'path';
import {compile} from 'handlebars';
import {readFileSync} from 'fs';
import dayjs from 'dayjs';
import chromium from 'chrome-aws-lambda'
import {S3} from 'aws-sdk'
import { v4 } from 'uuid'

import {APIGatewayProxyHandler} from 'aws-lambda'
import { document } from '../utils/dynamodbClient';

interface ICreateCertificate {
  id?: string;
  name: string;
  grade: string;
}

interface ICompileCertificate extends ICreateCertificate {
  date: string;
  medal: string;
}

const compileCertificate = async (data: ICompileCertificate) => {
  // get file path => process.cwd() gets project root path
  const filePath = join(process.cwd(), "src", "templates", "certificate.hbs");

  // read file as an utf-8
  const html = readFileSync(filePath, 'utf-8');

  // return file compiled using handlebars
  return compile(html)(data);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id, grade, name } = JSON.parse(event.body) as ICreateCertificate;
  let userId = id;
  if (!userId) {
    userId = v4();
  }
   // to check if the user was properly created in the step before, let get it from the database
   const response = await document.query({
    TableName: "user_certificate",
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": userId
    }    
  }).promise();

  const userAlreadyExists = response.Items[0];
  
  if (userAlreadyExists) {
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Certificate Válido",
        url: `https://your-bucket-name/${userAlreadyExists.id}.pdf`,
        id: userAlreadyExists.id,
        grade,
        name,
        date: new Date()
      })
    }
  }

 
    // create user data on the database
  await document.put({
    TableName: "user_certificate",
    Item: {
      id: userId,
      name,
      grade,
      created_at: new Date().getTime()
    }
  }).promise();
  
 
  // get path of the medal png
  const medalPath = join(process.cwd(), "src", "templates", "selo.png");

  // read the png as a base64 to be inserted at the template
  const medal = readFileSync(medalPath, "base64");

  const data: ICompileCertificate = {
    id: userId,
    grade,
    name,
    date: dayjs().format("DD/MM/YYYY"),
    medal
  }

  // execute the certificate compile function
  const content = await compileCertificate(data);

  // simulate a browser in our application (remember to authorize the lib on the servelss esbuild config (externals))
  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  });

  // simate a new page on the browser
  const page = await browser.newPage();

  // set the content to the new browser page
  await page.setContent(content);

  // transform the page into a pdf and save it into the path propertie for local development
  const pdf = await page.pdf({
    format: 'a4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    path: process.env.IS_OFFLINE ? "./certificate.pdf" : null
  })

  // close browser simulation
  browser.close()

  const s3 = new S3();

  await s3.putObject({
    Bucket: "vfcertificates2022",
    Key: `${userId}.pdf`,
    ACL: "public-read",
    Body: pdf,
    ContentType: "application/pdf"
  }).promise()

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Certificate generated with success",
      url: `https://your-bucket-name/${userId}.pdf`,
      id: userId,
      grade,
      name,
      date: new Date()
    })
  }
}