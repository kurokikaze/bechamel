## SaveUninitialized

If `saveUninitialized` is set to false, bechamel will not get the cookie. With `saveUninitialized` set to true this is not happening.

Using a real cookie from the browser works, so the problem is with the login process somehow?

Getting a cookie in Bechamel, logging in with it in browser and returning to Bechamel works. So the login process is broken. Cookie length doesnt matter. Also means the problem isn't the cookie encoding.

The problem was in the redirect after the login request. Somehow isomorphic-fetch didn't pass the cookie properly, so the request after the login (to the main page) got its own cookie, without being logged in. Only the first request got the right `set-cookie` header. Solved by setting `redirect` to manual in the login POST request.