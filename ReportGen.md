<script src="http://code.jquery.com/jquery-latest.min.js"></script>
<script>
$(function(){
  function getScoreNodes(match, cb) {
    $('.case_subcategory').each(function(i, node) { 
      if (match.test(node.innerHTML)) { 
        var title = node.innerHTML.match(/.*? (.*)/)[1];
        var node = $(node).parent();
        var scoreLines = node.nextUntil('.case_category_row');
        var titleRow = node.prev();
        var agents = titleRow.find('.agent').map(function(i, n) { return n.innerHTML; });
        cb(title, agents, scoreLines);
      } 
    });
  }
  for (var test = 1; test < 10; ++test) {
    getScoreNodes(new RegExp('9\.' + test), function(title, agents, nodes) {
      var agentScores = [];
      for (var agentIndex = 0; agentIndex < agents.length; ++agentIndex) {
        var scores = [];
        nodes.each(function(rowIndex, row) {
          row = $(row).find('.case_ok,.case_failed');
          var agentResult = $(row[agentIndex*2]);
          var ok = agentResult.is('.case_ok');
          var duration = parseInt(agentResult.find('.case_duration')[0].innerHTML);
          scores.push(ok ? duration : null);
        });
        agentScores.push({ name: agents[agentIndex], data: scores});
      }
      console.log(test, title, JSON.stringify(agentScores));
    });    
  }
})
</script>
