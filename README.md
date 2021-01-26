# Roam Private API

This library is a helper to automate your Roam Research adventures.

## How does it work?

It logs into chrome and performs actions on front-end, just as you would manually. No need to install chrome, this library comes with one. It uses your login and password, so **this won't work if you are using Google login**.

## Examples

- [Sync your Roam graph to Evernote](https://github.com/artpi/roam-research-private-api/blob/master/examples/sync_evernote.js)
- [Import arbitrary data into any note](https://github.com/artpi/roam-research-private-api/blob/master/examples/import-data.js)
- [Send note to Roam using the Quick Capture feature](https://github.com/artpi/roam-research-private-api/blob/master/examples/quick_capture.js)


## Command line tool `roam-api`

This package exposes a `roam-api` tool in your system. You can use it to automate Roam and bridge other systems with your Roam graph.

### Installation:
This entire library is build on node, so you need `node v12` and `npm v6` in your system. You can install the package the following way:
```
npm i -g roam-research-private-api
```

Now you can use a variety of commands. All command take the following arguments, which you can also set as environmental variables:
- `-g`, `--graph` or env variable `ROAM_API_GRAPH` - this is your graph name
- `-e`, `--email` or env variable `ROAM_API_EMAIL` - email to log into your Roam
- `-p`, `--password` or env variable `ROAM_API_PASSWORD` - password to your Roam.

#### `roam-api export` will export your Roam graph to a directory of your choice. 

This example will export the graph to your desktop. It will appear as "db.json".
```
roam-api export ~/Desktop
```

It can also push the new version of the graph to an URL of your choosing. That way, you can upload the graph to some other system or use it with Zapier and similar tools.
```
roam-api export ~/Desktop http://secret.url?token=secret_token.
```

#### `roam-api search` will search your Roam graph for a phrase:

```
roam-api search "potatoes"
```

Result will be JSON array of objects `{ blockUid, pageTitle, string }`

#### `roam-api-query` will let you do a full Datalog query.

This will find all block uids in your database which have the content "Import".
```
roam-api query '[:find ?uid :where [?b :block/string "Import"] [?b :block/uid ?uid]]'
```

Check out [this fantastic article](https://www.zsolt.blog/2021/01/Roam-Data-Structure-Query.html) to know more about the Roam data structure.

#### `roam-api create` create a block under specified uid. If no uid is provided, it will be inserted into your daily page:

```
roam-api create "This will be prepended to my daily page"
```



This is very much work in progress! Pull requests welcome :)
