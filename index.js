let fs = require('fs')
let path = require('path')
let express = require('express')
let morgan = require('morgan')
let nodeify = require('bluebird-nodeify')
let mime = require('mime-types')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')
let bluebird = require('bluebird')
let argv = require('yargs')
.default('dirname', '/Users/arunsasikumarsobha1/project/nodejs-training/server')
    .argv
let archiver = require('archiver')
let jot = require('json-over-tcp')
let chokidar = require('chokidar')


require('songbird')

const NODE_ENV = process.env.NODE_ENV
const PORT = process.env.PORT || 8000
const TCP_PORT = process.env.TCP_PORT || 8001
const ROOT_DIR = argv.dirname ? path.resolve(argv.dirname) : path.resolve(process.cwd())
const OPERATION_CREATE = 'create'
const OPERATION_UPDATE = 'update'
const OPERATION_DELETE = 'delete'

let clientSocketList = []
let app = express()



if(NODE_ENV === 'development'){
	app.use(morgan('dev'))
}

app.listen(PORT,()=>console.log(`Listening @ http://127.0.0.1:${PORT}`))


chokidar.watch(ROOT_DIR,{ignored: /[\/\\]\./,ignoreInitial: true}).on('all', async (event, path,stat,next) => {

	let fileType = stat && stat.isDirectory()? 'dir' :'file'
	let op= null
	let contents=''


  if(event === 'add' || 'addDir') {op=OPERATION_CREATE
  	if(event == 'addDir'){
  		fileType='dir'
  	}

  }
  
  if(event === 'unlink') op=OPERATION_DELETE

  if(event === 'change') op=OPERATION_UPDATE	
   
  for (let i = 0; i < clientSocketList.length; i++) { 
 	
 	if (fileType === 'file' && op !== OPERATION_DELETE) {
 	console.log(path)
    
 	 contents=await fs.promise.readFile(path,'utf-8')
      
    }

    try{
	let data = {
      'action': op,
      'path': path,
      'contents': contents,
      'type': fileType,
      'updated': Date.now()
    }

	data = JSON.stringify(data)
    console.log('After the method...' + data)
    clientSocketList[i].write(data)
	
    }catch(e){
    	console.log(e.stack)
    }
}
next()
})



app.get('*',setFileMeta,sendHeader,(req,res)=>{

	let accept=req.headers['accept']
console.log(req.headers)	
if(accept === 'application/x-gtar'){

try{
	let archive = archiver('zip')
	 archive.on('error', function(err) {
    res.status(500).send({error: err.message});
  });
	archive.on('end', function() {
    console.log('Archive wrote %d bytes', archive.pointer());
  });
	res.attachment('attachment.zip')
	console.log(req.filePath)
    archive.pipe(res)

    archive.directory(req.filePath,req.filePath.replace(__dirname + '/', ''));
    archive.finalize()

    }catch(e){
    	console.log(e.stack)
    }

}

if(res.body){
	res.json(res.body)
	return
}	
if(req.stat){
fs.createReadStream(req.filePath).pipe(res)
}else{

	res.status(404).send('Invalid Path')
}
})

app.head('*',setFileMeta,sendHeader,(req,res)=> res.end())


app.delete('*',setFileMeta,(req,res,next)=>{

if(!req.stat) return res.status(400).send('Invalid Path')


async() =>{
if(req.stat.isDirectory()){
	await rimraf.promise(req.filePath)
}else await fs.promise.unlink(req.filePath)

req.operation = OPERATION_DELETE
//res.end()
next()
}().catch(next)

},notifyClients)

app.put('*',setFileMeta,setDirDetails,(req,res,next)=>{
async() => {
if(req.stat) return res.status(405).send('File exists !!!!')
  await  mkdirp.promise(req.dirPath)
if(!req.isDir)
	req.pipe(fs.createWriteStream(req.filePath))
//res.end()
req.operation = OPERATION_CREATE
 next()
}().catch(next)


}, notifyClients)



app.post('*',setFileMeta,setDirDetails,(req,res,next)=>{
async() => {

if(!req.stat) return res.status(405).send('File does not exists')
  if(req.isDir) return res.status(405).send('Requested path is a directory!!')
await fs.promise.truncate(req.filePath,0)

req.pipe(fs.createWriteStream(req.filePath))
req.operation = OPERATION_UPDATE
//res.end()
 next()
}().catch(next)


}, notifyClients)







function setDirDetails(req,res,next){


let filePath=req.filePath

let endsWithDash= filePath.charAt(filePath.length-1) === path.sep
let hasExt = path.extname(filePath)!== ''
req.isDir= endsWithDash || ! hasExt
req.dirPath= req.isDir ? filePath : path.dirname(filePath)
next()
 
}



function setFileMeta(req,res,next){
 
 	let filePath = path.resolve(path.join(ROOT_DIR,req.url))


		if(filePath.indexOf(ROOT_DIR) !== 0)		{
			res.send(400,'Invalid path provided')
			return;
		}
		console.log('filePath::'+filePath)
		console.log('Root::'+ROOT_DIR)
		console.log('Indexof::'+filePath.indexOf(ROOT_DIR))

		req.filePath = filePath		
	
		fs.promise.stat(req.filePath)
		 	.then(stat => req.stat = stat, () => req.stat = null)
		 	.nodeify(next)

}


function sendHeader(req,res,next){
nodeify(async () =>{
	

	if(req.stat && req.stat.isDirectory()){
	let files = await fs.promise.readdir(req.filePath)
	res.body=JSON.stringify(files)
	res.setHeader('Content-Length',res.body.length)
	res.setHeader('Content-Type','application/json')
	return
	}

	let mimeType=mime.contentType(path.extname(req.filePath))
	if(req.stat)	res.setHeader('Content-Length',req.stat.size)
	res.setHeader('Content-Type',mimeType)

	
}(),next)
}


async function notifyFileSysChangesToClients(path,next){
console.log('In notify!!!!')
	nodeify(async() =>{
	console.log('In notify!!!!')
	}(),next)
}


async function notifyClients(req, res, next){
	
  for (let i = 0; i < clientSocketList.length; i++) {
    // Read the contents of the file
    let contents = null
    let fileType = req.isDir ? 'dir' : 'file'
    console.log('Notify Clients: ' + req.operation)
    // Get the file contents if the operation is PUT/POST
    if (fileType === 'file' && req.operation !== OPERATION_DELETE) {
      await fs.promise.readFile(req.filePath, 'utf-8')
      .then((fileContent) => {
        contents = fileContent
        console.log('Contents: ' + contents)
      })
    }

    let data = {
      'action': req.operation,
      'path': req.filePath,
      'contents': contents,
      'type': fileType,
      'updated': Date.now()
    }
    req.data = data
    data = JSON.stringify(req.data)
    console.log('After the method...' + data)
    clientSocketList[i].write(data)
    res.end()
  }
  next()
}



let tcpServer = jot.createServer(TCP_PORT).listen(TCP_PORT)


tcpServer.on('connection', (socket) => {

    socket.on('data', (data) => {
    	console.log('Connection  established with client ID'+data.clientId)
    clientSocketList.push(socket)

  })
})



