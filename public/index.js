document.addEventListener("DOMContentLoaded", () => {
   const math = document.querySelector("#math");
   const science = document.querySelector("#science");
   const computer = document.querySelector("#computer");
   const social = document.querySelector("#social");
   const optmath = document.querySelector("#optmath");
   const health = document.querySelector("#Health");

   const icons = document.querySelectorAll("i");
   const spanmath = document.querySelector("#spanmath");
   const spanscience = document.querySelector("#spanscience");
   const spancomputer = document.querySelector("#spancomputer");
   const spansocial = document.querySelector("#spansocial");
   const spanopt = document.querySelector("#spanopt");
   const spanhealth = document.querySelector("#spanhealth");
   const logos = document.querySelectorAll(".logo");

   function effect(sub, icon, spansub, color, index) {
      if (!sub || !icon || !spansub || !logos[index]) {
         return;
      }

      sub.style.backgroundColor = "white";
      icon.style.color = "white";
      spansub.style.color = color;
      logos[index].style.backgroundColor = color;
   }

   function outeffect(sub, icon, spansub, color, index) {
      if (!sub || !icon || !spansub || !logos[index]) {
         return;
      }

      sub.style.backgroundColor = color;
      icon.style.color = color;
      spansub.style.color = "white";
      logos[index].style.backgroundColor = "white";
   }

   const bindings = [
      [math, icons[0], spanmath, "#f198b4", 0],
      [science, icons[1], spanscience, "#84eadb", 1],
      [computer, icons[2], spancomputer, "#999df0", 2],
      [social, icons[3], spansocial, "#67ea93", 3],
      [optmath, icons[4], spanopt, "#66b2ec", 4],
      [health, icons[5], spanhealth, "#ebbb46", 5]
   ];

   bindings.forEach(([sub, icon, spansub, color, index]) => {
      if (!sub || !icon || !spansub) {
         return;
      }

      sub.addEventListener("mouseover", () => {
         effect(sub, icon, spansub, color, index);
      });

      sub.addEventListener("mouseout", () => {
         outeffect(sub, icon, spansub, color, index);
      });
   });
});