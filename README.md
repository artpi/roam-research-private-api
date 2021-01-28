## Roam Private API

This project exposes command line tool (`roam-api`) and a `node` library to connect Roam Research to your other software. You can use it in bash scripts, Github actions, or as a dependency of your project.
## How does it work?

It looks like Roam is not providing a REST API any time soon. If you want to bridge Roam with your other software, you can do so from within Roam (with JavaScript), but that has limited number of use cases.
Without a REST API, this project launches an invisible browser and performs automated actions, just as you would manually. No need to install chrome, this library comes with one. It uses your login and password, so **this won't work if you are using Google login**.
It wraps around import/export functionality and actions exposed via `roamAlphaApi`.
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

## Library to use in your project.

As mentioned, this is also a library that you can use within your project. Here are examples on how to do so:

- [All the functionality in the roam-api tool](https://github.com/artpi/roam-research-private-api/blob/master/examples/cmd.js)
- [Sync your Roam graph to Evernote](https://github.com/artpi/roam-research-private-api/blob/master/examples/sync_evernote.js) - you can also use command-line utility `roam-evernote-sync`.
- [Import arbitrary data into any note](https://github.com/artpi/roam-research-private-api/blob/master/examples/import-data.js)
- [Send note to Roam using the Quick Capture feature](https://github.com/artpi/roam-research-private-api/blob/master/examples/quick_capture.js)

###

Pull requests welcome and I take no responsibility in case this messes up your Roam Graph :).
