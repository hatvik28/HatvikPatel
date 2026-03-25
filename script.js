document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".tab.active").classList.remove("active");
    document.querySelector(".panel.active").classList.remove("active");

    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});
