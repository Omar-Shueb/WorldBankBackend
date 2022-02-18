# WorldBankBackend

## How to use the API - Endpoints

### GET - /search

This endpoint takes the query parameters country, indicator, year, yearEnd and conditionally adds to the postgreSQL query, dependent on their existence. A request to add the query parameters to a local table called 'history' is made. If no country is selected, an error is sent back.

### GET -/indicators/:country

This endpoint takes a country id as a server parameter and uses it to retrieve all the distinct indicators associated with that country. These distinct indicators are displayed in the dropdown box on the search page. The dropdown menu restricts the choice of the user to only real country/indicator combinations.

### POST - /createaccount

Here the request takes a username and password in the body and stores it to a database of users. The password is hashed before being stored. The request must receive both a username and password otherwise an error will be sent back. Upon completetion a success message is sent back.

### POST - /login

Here the request will take a username and password in the body and will check it against a database of users. The hashed passwords are compared and if successful will send back a response with a success message and a session will be stored in the sessions database. If the passwords do not match or the username cannot be found an error will be sent back. The request must receive both a username and password otherwise an error will be sent back.

### GET - /sessions

The get sessions endpoint checks to see if a user is logged in. It checks the cookies on the server and if there is an associated user where loggedIn = true, it means If there is a user currently logged in, it will return true and false if not.

### PATCH - /sessions

When a user logs out, a fetch request is sent to the server to patch the sessions table. this patch request changes the logged in column to false for the logged in user.

### GET - /history

The history endpoint fetches the history from the history table for the user who is currently logged in. If that user is an admin, all search history is returned to the front end.
