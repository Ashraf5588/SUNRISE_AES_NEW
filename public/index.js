let math = document.querySelector("#math")
let science = document.querySelector("#science")
let computer = document.querySelector("#computer")
let social = document.querySelector("#social")
let optmath = document.querySelector("#optmath")
let health = document.querySelector("#Health")



icon = document.querySelectorAll("i")
spanmath = document.querySelector("#spanmath")
logo = document.querySelectorAll(".logo")



scienceicon = document.querySelector(".fa-flask")


function effect(sub,icon,spansub,color,i)
{
   sub.style.backgroundColor = "white"
   icon.style.color = "white"
   spansub.style.color=color
   logo[i].style.backgroundColor = color
}
function outeffect(sub,iname,spansub,color,i)
{
   sub.style.backgroundColor = color
   iname.style.color = color
   spansub.style.color="white"
   logo[i].style.backgroundColor = "white"
}

math.addEventListener("mouseover",()=>{effect(math,icon[0],spanmath,"#f198b4",0);})
math.addEventListener("mouseout",()=>{outeffect(math,icon[0],spanmath,"#f198b4",0)})

science.addEventListener("mouseover",()=>{effect(science,icon[1],spanscience,"#84eadb",1);})
science.addEventListener("mouseout",()=>{outeffect(science,icon[1],spanscience,"#84eadb",1)})


computer.addEventListener("mouseover",()=>{effect(computer,icon[2],spancomputer,"#999df0",2);})
computer.addEventListener("mouseout",()=>{outeffect(computer,icon[2],spancomputer,"#999df0",2);})

social.addEventListener("mouseover",()=>{effect(social,icon[3],spansocial,"#67ea93",3);})
social.addEventListener("mouseout",()=>{outeffect(social,icon[3],spansocial,"#67ea93",3);})

optmath.addEventListener("mouseover",()=>{effect(optmath,icon[4],spanopt,"#66b2ec",4);})
optmath.addEventListener("mouseout",()=>{outeffect(optmath,icon[4],spanopt,"#66b2ec",4);})

health.addEventListener("mouseover",()=>{effect(health,icon[5],spanhealth,"#ebbb46",5);})
health.addEventListener("mouseout",()=>{outeffect(health,icon[5],spanhealth,"#ebbb46",5);})