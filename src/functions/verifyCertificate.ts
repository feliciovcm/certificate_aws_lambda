import { APIGatewayProxyHandler } from "aws-lambda";
import { document } from "../utils/dynamodbClient";

interface User {
  name: string;
  id: string;
  grade: string;
  created_at: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {

  const { id } = event.pathParameters;

  const response = await document.query({
    TableName: "user_certificate",
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": id
    }    
  }).promise();

  const user = response.Items[0] as User;

  if (user) {
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Certificado válido",
        name: user.name,
        url: `https://your-bucket-name/${id}.pdf`
      })
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: "Certificate Inválido",
    })
  }
}