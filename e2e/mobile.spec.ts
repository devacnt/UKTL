import {test,expect} from "./fixtures";
test("375px main sign-in and mobile navigation stay within the viewport",async({page})=>{
 await page.setViewportSize({width:375,height:667});
 await page.goto("/");
 await page.getByRole("button",{name:"Open menu"}).click();
 await page.getByRole("navigation").first().getByRole("link",{name:"Sign in",exact:true}).click();
 await expect(page).toHaveURL(/\/auth\/login/);
 await expect(page.getByLabel("Email",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Email me a sign-in link"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
