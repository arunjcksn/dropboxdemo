let fs = require('fs')
let mkdirp = require('mkdirp')
require('songbird')
let rimraf = require('rimraf')
let jsonovertcp = require('json-over-tcp')
let path = require('path')
let argv = require('yargs')
  .argv

const SERVER_TCP_PORT = process.env.SERVER_TCP_PORT || 8001
const CLIENT_ID = process.env.CLIENT_ID || 10001

const FILE_TYPE_DIR = 'dir'
const OPERATION_CREATE = 'create'
const OPERATION_UPDATE = 'update'
const OPERATION_DELETE = 'delete'

const ROOT_DIR = argv.dirname ? path.resolve(argv.dirname) : '/tmp'

function handleData(data){
    console.log('Data from server: ' + data)
    let dataFromServer = JSON.parse(data)
    console.log('Received ' + dataFromServer.action + ' operation from the server. File path: ' + dataFromServer.path)

    if(dataFromServer.action === OPERATION_CREATE){
      handleCreate(dataFromServer)
    } else if (dataFromServer.action === OPERATION_UPDATE) {
      handleUpdate(dataFromServer)
    } else if (dataFromServer.action === OPERATION_DELETE) {
      handleDelete(dataFromServer)
    }else {
      console.log('Unknown operation request from the server. Exiting now!')
      return
    }
}

// Create a connection to the server and register with the server
async () => {
  console.log(`Client listening to server at: ${SERVER_TCP_PORT}`)
  console.log(`Local File System path: ${ROOT_DIR}`)
  let socket = jsonovertcp.connect(SERVER_TCP_PORT, () => {
    socket.write({clientId: CLIENT_ID})
  })

  socket.on('data', (data) => {
    console.log('data in socket')
   handleData(data)
  })
}()

async function doesFileExist(filePath, processData){
  console.log('Filepath: ' + filePath)
  await fs.promise.stat(filePath)
  .then(
   () => {
     processData.filexists = true
   },
   () => {
     processData.filexists = false
   })
}

async function handleCreate(data){
  let filePath = ROOT_DIR + data.path
  let processData = {}
  await doesFileExist(filePath, processData)

  if (processData.filexists === true){
    console.log('File exists. Exiting now. File path: '+ filePath)
    return
  } else {
    console.log('File doesnt exist. Continuing to create the file: ' + filePath)
  }

  // Write the contents to a file
  if (data.type === FILE_TYPE_DIR) {
    await mkdirp.promise(filePath)
  } else {
    await mkdirp.promise(path.dirname(filePath))
    await fs.promise.writeFile(filePath, data.contents, 'utf-8')
    console.log('File created successfully. File Path: ' + filePath)
  }
}

async function handleUpdate(data){
  let filePath = ROOT_DIR + data.path
  if (data.type === FILE_TYPE_DIR) {
     console.log('File is a directory. Exiting now. File Path: ' + filePath)
     return
  }
  // Write the contents to a file
  await fs.promise.truncate(filePath, 0)
  await fs.promise.writeFile(filePath, data.contents, 'utf-8')
  console.log('File updated successfully. File path: ' + filePath)
}

async function handleDelete(data){
  let filePath = ROOT_DIR + data.path
  let processData = {}
  await doesFileExist(filePath, processData)
  if(processData.filexists !== true){
    console.log('File doesnt exist locally. Exiting now. File Path: ' + filePath)
    return
  }

  if(data.type === FILE_TYPE_DIR){
      await rimraf.promise(filePath)
  } else {
    await fs.promise.unlink(filePath)
  }
  console.log('File deleted successfully. File Path: ' + filePath)
}
