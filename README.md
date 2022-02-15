# WorldBankBackend

## How to use the API - Endpoints

### POST - /createaccount
Here the request takes a username and password in the body and stores it to a database of users. The password is hashed before being stored. The request must receive both a username and password otherwise an error will be sent back. Upon completetion a success message is sent back.

### POST - /login
Here the request will take a username and password in the body and will check it against a database of users. The hashed passwords are compared and if successful will send back a response with a success message and a session will be stored in the sessions database. If the passwords do not match or the username cannot be found an error will be sent back. The request must receive both a username and password otherwise an error will be sent back. 
