import express from "express"

const app = express();

app.get("/git/callback",(req,res)=>{
    res.end("Auth")
})

app.listen(3000,(req,res)=>{
    console.log("Server Started at port : 3000");
})