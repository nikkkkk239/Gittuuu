import express from "express"
import multer from "multer";
import unzipper from "unzipper";
import path from "path";
import fs from "fs";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const upload = multer({dest : "uploads/"});

app.post("/deploy",upload.single("file") , async(req,res)=>{
    try {
        const filePath = req.file.path;
        const deployPath = path.join(__dirname,"deployed" , Date.now().toString());

        fs.mkdirSync(deployPath, { recursive: true });
        await fs.createReadStream(filePath).pipe(unzipper.Extract({ path: deployPath })).promise();

        const url = `http://localhost:8080/${path.basename(deployPath)}`;

        res.json({success:true , url});
    } catch (error) {
        console.log("Error:" , error);
        res.status(500).json({success:false , error:error.message});
    }
})

app.listen(3000,(req,res)=>{
    console.log("Server Started at port : 3000");
})